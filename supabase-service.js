// Serviço de integração com Supabase
class SupabaseService {
    constructor() {
        this.client = null;
        this.messageChannel = null; // Canal compartilhado para mensagens
        this.init();
    }

    init() {
        // Verifica se o Supabase já foi inicializado (pode estar em window.supabase)
        const checkSupabase = () => {
            if (typeof window !== 'undefined' && window.supabase) {
                this.client = window.supabase;
                console.log('SupabaseService inicializado');
                return true;
            } else if (typeof supabase !== 'undefined' && supabase) {
                this.client = supabase;
                console.log('SupabaseService inicializado');
                return true;
            }
            return false;
        };
        
        if (!checkSupabase()) {
            console.warn('Supabase ainda não está disponível. Tentando novamente...');
            // Tenta novamente após um delay
            let attempts = 0;
            const maxAttempts = 25; // 5 segundos
            const retry = setInterval(() => {
                attempts++;
                if (checkSupabase() || attempts >= maxAttempts) {
                    clearInterval(retry);
                    if (!this.client) {
                        console.error('SupabaseService: Não foi possível inicializar após várias tentativas');
                    }
                }
            }, 200);
        }
    }
    
    isReady() {
        return this.client !== null && typeof this.client !== 'undefined';
    }
    
    checkReady() {
        if (!this.isReady()) {
            throw new Error('Supabase não está inicializado. Aguarde alguns instantes e tente novamente.');
        }
    }

    // ========== AUTENTICAÇÃO ==========
    
    async signUp(email, password, nickname, city) {
        try {
            this.checkReady();
            
            // Verifica se o apelido já existe
            const nicknameExists = await this.checkNicknameExists(nickname);
            if (nicknameExists) {
                throw new Error('Este apelido já está em uso. Por favor, escolha outro apelido.');
            }
            
            // Cria o usuário no Supabase Auth com metadata
            // emailRedirectTo: null desabilita o redirecionamento de confirmação
            const { data: authData, error: authError } = await this.client.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: null,
                    data: {
                        nickname: nickname,
                        city: city
                    }
                }
            });

            if (authError) throw authError;

            if (!authData.user) {
                throw new Error('Usuário não foi criado');
            }

            // IMPORTANTE: Faz login imediatamente após o cadastro para estabelecer a sessão
            // Isso permite que auth.uid() funcione nas políticas RLS
            const { data: loginData, error: loginError } = await this.client.auth.signInWithPassword({
                email,
                password,
            });

            if (loginError) {
                // Se o erro for de e-mail não confirmado, informa o usuário
                if (loginError.message?.includes('email') && loginError.message?.includes('confirm')) {
                    throw new Error('Por favor, desabilite a confirmação de e-mail nas configurações do Supabase (Authentication > Settings > Email Auth). Veja o arquivo disable-email-confirmation.md para instruções.');
                }
                console.warn('Aviso: Não foi possível fazer login automático após cadastro:', loginError);
                // Continua mesmo assim, o trigger pode ter criado o perfil
            }

            // Aguarda um pouco para o trigger executar (se estiver configurado)
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Tenta buscar o perfil criado pelo trigger
            let profileData = null;
            const { data: existingProfile } = await this.client
                .from('profiles')
                .select('*')
                .eq('id', authData.user.id)
                .single();

            if (existingProfile) {
                profileData = existingProfile;
            } else {
                // Se o trigger não criou, tenta criar manualmente
                // Agora com a sessão estabelecida, auth.uid() deve funcionar
                const { data: newProfile, error: insertError } = await this.client
                    .from('profiles')
                    .insert([
                        {
                            id: authData.user.id,
                            nickname,
                            city,
                            email,
                            last_activity: new Date().toISOString(),
                        }
                    ])
                    .select()
                    .single();

                if (insertError) {
                    // Se ainda falhar, tenta buscar novamente (trigger pode ter executado com delay)
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    const { data: retryProfile } = await this.client
                        .from('profiles')
                        .select('*')
                        .eq('id', authData.user.id)
                        .single();
                    
                    if (retryProfile) {
                        profileData = retryProfile;
                    } else {
                        // Última tentativa: verifica se o usuário precisa confirmar email
                        if (authData.user && !authData.session) {
                            throw new Error('Por favor, verifique seu e-mail para confirmar a conta antes de continuar. Se você já confirmou, tente fazer login.');
                        }
                        throw new Error(`Não foi possível criar o perfil. Erro: ${insertError.message}. Execute o script fix-rls-policies.sql no Supabase.`);
                    }
                } else {
                    profileData = newProfile;
                }
            }

            if (!profileData) {
                throw new Error('Perfil não foi criado. Execute o script fix-rls-policies.sql no Supabase para configurar o trigger automático.');
            }

            // Retorna os dados do login se disponível, senão usa os do signUp
            const finalUser = loginData?.user || authData.user;
            return { user: finalUser, profile: profileData };
        } catch (error) {
            console.error('Erro ao cadastrar:', error);
            throw error;
        }
    }

    async signIn(email, password) {
        try {
            this.checkReady();
            const { data, error } = await this.client.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            // Atualiza última atividade
            await this.updateLastActivity(data.user.id);

            // Busca o perfil do usuário
            const { data: profile, error: profileError } = await this.client
                .from('profiles')
                .select('*')
                .eq('id', data.user.id)
                .single();

            if (profileError) throw profileError;

            return { user: data.user, profile };
        } catch (error) {
            console.error('Erro ao fazer login:', error);
            throw error;
        }
    }

    async signOut() {
        try {
            const { error } = await this.client.auth.signOut();
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
            throw error;
        }
    }

    async getCurrentUser() {
        try {
            this.checkReady();
            const { data: { user }, error } = await this.client.auth.getUser();
            
            // Se não há sessão, retorna null silenciosamente (não é um erro)
            if (error) {
                // AuthSessionMissingError é esperado quando não há usuário logado
                if (error.name === 'AuthSessionMissingError' || error.message?.includes('session')) {
                    return null;
                }
                throw error;
            }
            
            if (!user) return null;

            // Busca o perfil
            const { data: profile, error: profileError } = await this.client
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (profileError) {
                // Se o perfil não existe, também não é necessariamente um erro crítico
                console.warn('Perfil não encontrado para o usuário:', user.id);
                return null;
            }

            return { user, profile };
        } catch (error) {
            // Só loga erros que não sejam relacionados à ausência de sessão
            if (error.name !== 'AuthSessionMissingError' && !error.message?.includes('session')) {
                console.error('Erro ao buscar usuário atual:', error);
            }
            return null;
        }
    }

    // ========== PERFIS ==========

    async checkNicknameExists(nickname, excludeUserId = null) {
        try {
            if (!this.isReady()) {
                return false; // Se não estiver pronto, assume que não existe
            }
            
            if (!this.client || !this.client.from) {
                return false;
            }

            let query = this.client
                .from('profiles')
                .select('id, nickname')
                .eq('nickname', nickname);

            // Se houver um userId para excluir (para atualização de perfil)
            if (excludeUserId) {
                query = query.neq('id', excludeUserId);
            }

            const { data, error } = await query;

            if (error) throw error;
            return (data && data.length > 0);
        } catch (error) {
            // Em caso de erro, retorna false para não bloquear o fluxo
            console.warn('Erro ao verificar apelido:', error);
            return false;
        }
    }

    async updateLastActivity(userId) {
        try {
            // Verifica se está pronto sem lançar exceção
            if (!this.isReady()) {
                return false; // Silencioso - não loga warning
            }
            
            // Verifica se o cliente tem os métodos necessários
            if (!this.client || !this.client.from) {
                return false; // Silencioso - não loga warning
            }

            const { error } = await this.client
                .from('profiles')
                .update({ last_activity: new Date().toISOString() })
                .eq('id', userId);

            if (error) throw error;
            return true;
        } catch (error) {
            // Se for erro de rede, suprime completamente (não é crítico e já tem fallback no localStorage)
            const errorMessage = error?.message || String(error) || '';
            const errorString = errorMessage.toLowerCase();
            
            // Apenas loga erros que não são de rede (erros de permissão, validação, etc.)
            if (
                !errorString.includes('failed to fetch') && 
                !errorString.includes('networkerror') &&
                !errorString.includes('fetch') &&
                !errorString.includes('network') &&
                !errorString.includes('connection') &&
                !errorString.includes('load failed')
            ) {
                console.error('Erro ao atualizar atividade:', error);
            }
            // Erros de rede são completamente silenciosos (já tem fallback no localStorage)
            return false;
        }
    }

    async setUserOffline(userId) {
        try {
            // Verifica se está pronto sem lançar exceção
            if (!this.isReady()) {
                return false; // Silencioso - não loga warning
            }
            
            // Verifica se o cliente tem os métodos necessários
            if (!this.client || !this.client.from) {
                return false; // Silencioso - não loga warning
            }

            // Define last_activity como uma data muito antiga para que o usuário não apareça como online
            // Usando uma data de 1 ano atrás para garantir que não apareça na lista
            const offlineDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
            
            const { error } = await this.client
                .from('profiles')
                .update({ last_activity: offlineDate })
                .eq('id', userId);

            if (error) throw error;
            return true;
        } catch (error) {
            // Se for erro de rede, suprime completamente (não é crítico)
            const errorMessage = error?.message || String(error) || '';
            const errorString = errorMessage.toLowerCase();
            
            // Apenas loga erros que não são de rede (erros de permissão, validação, etc.)
            if (
                !errorString.includes('failed to fetch') && 
                !errorString.includes('networkerror') &&
                !errorString.includes('fetch') &&
                !errorString.includes('network') &&
                !errorString.includes('connection') &&
                !errorString.includes('load failed')
            ) {
                console.error('Erro ao marcar usuário como offline:', error);
            }
            // Erros de rede são completamente silenciosos
            return false;
        }
    }

    async updateProfile(userId, updates) {
        try {
            this.checkReady();
            const { data: { user } } = await this.client.auth.getUser();
            if (!user || user.id !== userId) {
                throw new Error('Você só pode editar seu próprio perfil');
            }

            // Verifica se o novo apelido já está em uso (se estiver sendo alterado)
            if (updates.nickname !== undefined) {
                const nicknameExists = await this.checkNicknameExists(updates.nickname, userId);
                if (nicknameExists) {
                    throw new Error('Este apelido já está em uso por outro usuário. Por favor, escolha outro apelido.');
                }
            }

            // Prepara os dados para atualização
            const updateData = {};
            if (updates.nickname !== undefined) updateData.nickname = updates.nickname;
            if (updates.city !== undefined) updateData.city = updates.city;
            if (updates.email !== undefined) updateData.email = updates.email;

            // Atualiza o perfil
            const { data, error } = await this.client
                .from('profiles')
                .update(updateData)
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;

            // Se o e-mail foi alterado, atualiza também no auth
            if (updates.email && updates.email !== user.email) {
                const { error: emailError } = await this.client.auth.updateUser({
                    email: updates.email
                });
                if (emailError) {
                    console.warn('Aviso: E-mail atualizado no perfil mas não no auth:', emailError);
                }
            }

            return data;
        } catch (error) {
            console.error('Erro ao atualizar perfil:', error);
            throw error;
        }
    }

    async getOnlineUsers() {
        try {
            // Verifica se o cliente está pronto
            if (!this.isReady()) {
                console.warn('Supabase não está pronto para buscar usuários online');
                return [];
            }
            
            // Verifica se o cliente tem os métodos necessários
            if (!this.client || !this.client.from) {
                console.warn('Cliente Supabase não está configurado corretamente');
                return [];
            }
            
            // OTIMIZAÇÃO: Reduzido para 15 minutos (mais eficiente) e remove email (não necessário)
            const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
            
            // OTIMIZAÇÃO: Seleciona apenas campos necessários (remove email)
            const { data, error } = await this.client
                .from('profiles')
                .select('id, nickname, city, last_activity')
                .gte('last_activity', fifteenMinutesAgo)
                .order('last_activity', { ascending: false })
                .limit(100); // Limite máximo de usuários online

            if (error) throw error;
            return data || [];
        } catch (error) {
            // Se for erro de rede ou cliente não pronto, retorna array vazio silenciosamente
            const errorMessage = error?.message || String(error) || '';
            const errorString = errorMessage.toLowerCase();
            
            if (
                errorString.includes('failed to fetch') || 
                errorString.includes('networkerror') ||
                errorString.includes('não está inicializado') ||
                errorString.includes('fetch') ||
                errorString.includes('network') ||
                errorString.includes('connection')
            ) {
                console.warn('Erro de rede ao buscar usuários online:', errorMessage);
                return [];
            }
            
            // Para outros erros, também retorna array vazio mas loga o erro completo
            console.error('Erro ao buscar usuários online:', error);
            return [];
        }
    }

    // ========== MENSAGENS ==========

    // SISTEMA EFÊMERO: Mensagens não são mais salvas no banco
    // Usa apenas Broadcast Channel do Realtime
    async sendMessage(messageData) {
        try {
            this.checkReady();
            
            // Gera ID único para a mensagem
            const messageId = crypto.randomUUID();
            const timestamp = new Date().toISOString();
            
            // Busca perfil do usuário atual para incluir nickname e city
            const currentUser = await this.getCurrentUser();
            const profile = currentUser?.profile;
            
            // Formata mensagem completa
            const fullMessage = {
                id: messageId,
                userId: messageData.user_id,
                nickname: profile?.nickname || 'Usuário',
                city: profile?.city || '',
                content: messageData.content,
                type: messageData.type,
                mediaType: messageData.media_type,
                mediaData: messageData.media_url,
                recipientId: messageData.recipient_id,
                timestamp: timestamp
            };
            
            // CORREÇÃO: Usa o canal compartilhado (mesmo canal usado para receber)
            // Garante que todos os usuários estão no mesmo canal
            if (!this.messageChannel) {
                // Se o canal não existe, cria e inscreve
                this.messageChannel = this.client.channel('messages-broadcast', {
                    config: {
                        broadcast: { self: true }
                    }
                });
                
                // Aguarda a inscrição estar completa antes de enviar
                await new Promise((resolve, reject) => {
                    this.messageChannel.subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                            console.log('✅ Canal de mensagens pronto para enviar');
                            resolve();
                        } else if (status === 'CHANNEL_ERROR') {
                            reject(new Error('Erro ao inscrever no canal'));
                        }
                    });
                });
            }
            
            // Verifica se o canal está inscrito antes de enviar
            if (this.messageChannel.state !== 'joined') {
                console.warn('⚠️ Canal não está inscrito, tentando novamente...');
                await this.messageChannel.subscribe();
            }
            
            console.log('📤 Enviando mensagem via broadcast:', fullMessage);
            
            // Envia via Broadcast Channel
            const { error } = await this.messageChannel.send({
                type: 'broadcast',
                event: 'message',
                payload: fullMessage
            });
            
            if (error) {
                console.error('Erro ao enviar mensagem via broadcast:', error);
                throw error;
            }
            
            // Retorna a mensagem formatada
            return fullMessage;
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            throw error;
        }
    }

    async getPublicMessages(limit = 100) {
        try {
            this.checkReady();
            // OTIMIZAÇÃO: Seleciona apenas campos necessários (remove campos desnecessários)
            const { data, error } = await this.client
                .from('messages')
                .select(`
                    id,
                    user_id,
                    content,
                    type,
                    media_type,
                    media_url,
                    created_at,
                    profiles!messages_user_id_fkey(nickname, city)
                `)
                .eq('type', 'public')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            
            // Formata os dados para compatibilidade com o código existente
            return (data || []).map(msg => ({
                id: msg.id,
                userId: msg.user_id,
                nickname: msg.profiles?.nickname || 'Usuário',
                city: msg.profiles?.city || '',
                content: msg.content,
                type: msg.type,
                mediaType: msg.media_type,
                mediaData: msg.media_url,
                recipientId: msg.recipient_id,
                timestamp: msg.created_at
            }));
        } catch (error) {
            console.error('Erro ao buscar mensagens públicas:', error);
            return [];
        }
    }

    async getPrivateMessages(userId, otherUserId, limit = 100) {
        try {
            this.checkReady();
            // OTIMIZAÇÃO: Seleciona apenas campos necessários e usa OR para uma única query
            // Busca mensagens privadas entre os dois usuários em uma única query
            const { data: messages, error: messagesError } = await this.client
                .from('messages')
                .select(`
                    id,
                    user_id,
                    recipient_id,
                    content,
                    type,
                    media_type,
                    media_url,
                    created_at,
                    profiles!messages_user_id_fkey(nickname, city)
                `)
                .eq('type', 'private')
                .or(`and(user_id.eq.${userId},recipient_id.eq.${otherUserId}),and(user_id.eq.${otherUserId},recipient_id.eq.${userId})`)
                .order('created_at', { ascending: false })
                .limit(limit * 2); // Limite maior porque busca ambas as direções

            if (messagesError) throw messagesError;
            
            // Combina e ordena todas as mensagens
            const allMessages = messages || [];
            allMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            // Formata os dados para compatibilidade
            return allMessages.map(msg => ({
                id: msg.id,
                userId: msg.user_id,
                nickname: msg.profiles?.nickname || 'Usuário',
                city: msg.profiles?.city || '',
                content: msg.content,
                type: msg.type,
                mediaType: msg.media_type,
                mediaData: msg.media_url,
                recipientId: msg.recipient_id,
                timestamp: msg.created_at
            }));
        } catch (error) {
            console.error('Erro ao buscar mensagens privadas:', error);
            return [];
        }
    }

    async deleteUserMessages(userId) {
        try {
            // Remove mensagens enviadas pelo usuário
            const { error: sentError } = await this.client
                .from('messages')
                .delete()
                .eq('user_id', userId);

            if (sentError) throw sentError;

            // Remove mensagens privadas recebidas pelo usuário
            const { error: receivedError } = await this.client
                .from('messages')
                .delete()
                .eq('recipient_id', userId)
                .eq('type', 'private');

            if (receivedError) throw receivedError;

            return true;
        } catch (error) {
            console.error('Erro ao deletar mensagens:', error);
            throw error;
        }
    }

    // ========== BLOQUEIO DE USUÁRIOS ==========

    async blockUser(blockedUserId) {
        try {
            this.checkReady();
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) throw new Error('Usuário não autenticado');

            const { data, error } = await this.client
                .from('user_blocks')
                .insert([
                    {
                        blocker_id: user.id,
                        blocked_id: blockedUserId
                    }
                ])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Erro ao bloquear usuário:', error);
            throw error;
        }
    }

    async unblockUser(blockedUserId) {
        try {
            this.checkReady();
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) throw new Error('Usuário não autenticado');

            const { error } = await this.client
                .from('user_blocks')
                .delete()
                .eq('blocker_id', user.id)
                .eq('blocked_id', blockedUserId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Erro ao desbloquear usuário:', error);
            throw error;
        }
    }

    async getBlockedUsers() {
        try {
            this.checkReady();
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) return [];

            const { data, error } = await this.client
                .from('user_blocks')
                .select(`
                    blocked_id,
                    profiles!user_blocks_blocked_id_fkey(id, nickname, city, email)
                `)
                .eq('blocker_id', user.id);

            if (error) throw error;
            return (data || []).map(block => ({
                id: block.blocked_id,
                profile: block.profiles
            }));
        } catch (error) {
            console.error('Erro ao buscar usuários bloqueados:', error);
            return [];
        }
    }

    async isUserBlocked(userId) {
        try {
            this.checkReady();
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) return false;

            const { data, error } = await this.client
                .from('user_blocks')
                .select('id')
                .eq('blocker_id', user.id)
                .eq('blocked_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = não encontrado
                throw error;
            }

            return !!data;
        } catch (error) {
            console.error('Erro ao verificar se usuário está bloqueado:', error);
            return false;
        }
    }

    async isBlockedByUser(userId) {
        try {
            this.checkReady();
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) return false;

            const { data, error } = await this.client
                .from('user_blocks')
                .select('id')
                .eq('blocker_id', userId)
                .eq('blocked_id', user.id)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            return !!data;
        } catch (error) {
            console.error('Erro ao verificar se foi bloqueado:', error);
            return false;
        }
    }

    // ========== STORAGE (para mídias) ==========

    async uploadMedia(file, userId, messageId) {
        try {
            this.checkReady();
            
            const fileExt = file.name.split('.').pop();
            // O caminho é apenas userId/messageId.ext (sem o prefixo 'media/' porque já estamos no bucket 'media')
            const filePath = `${userId}/${messageId}.${fileExt}`;

            const { data, error } = await this.client.storage
                .from('media')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) {
                console.error('Erro detalhado ao fazer upload:', error);
                throw error;
            }

            // Verifica se o bucket é público ou privado
            // Tenta obter URL pública primeiro
            const { data: urlData } = this.client.storage
                .from('media')
                .getPublicUrl(filePath);
            
            // Se o bucket for público, a URL pública funciona
            // Se for privado, precisamos usar signed URL
            // Por padrão, vamos usar URL pública (assumindo bucket público)
            // Se não funcionar, o usuário precisa tornar o bucket público ou usar signed URLs
            return urlData.publicUrl;
        } catch (error) {
            console.error('Erro ao fazer upload de mídia:', error);
            throw error;
        }
    }

    async deleteUserMedia(userId) {
        try {
            const { data: files, error: listError } = await this.client.storage
                .from('media')
                .list(userId);

            if (listError) throw listError;

            if (files && files.length > 0) {
                const filePaths = files.map(file => `${userId}/${file.name}`);
                
                const { error: deleteError } = await this.client.storage
                    .from('media')
                    .remove(filePaths);

                if (deleteError) throw deleteError;
            }

            return true;
        } catch (error) {
            console.error('Erro ao deletar mídias:', error);
            throw error;
        }
    }

    async deleteUserVideoCallInvites(userId) {
        try {
            this.checkReady();
            
            // Remove convites onde o usuário é quem chamou
            const { error: callerError } = await this.client
                .from('video_call_invites')
                .delete()
                .eq('caller_id', userId);

            if (callerError) throw callerError;

            // Remove convites onde o usuário é quem recebeu
            const { error: recipientError } = await this.client
                .from('video_call_invites')
                .delete()
                .eq('recipient_id', userId);

            if (recipientError) throw recipientError;

            return true;
        } catch (error) {
            console.error('Erro ao deletar convites de vídeo chamada:', error);
            throw error;
        }
    }

    async deleteUserWebRTCSignals(userId) {
        try {
            this.checkReady();
            
            // Remove sinais onde o usuário é remetente
            const { error: fromError } = await this.client
                .from('webrtc_signals')
                .delete()
                .eq('from_user_id', userId);

            if (fromError) throw fromError;

            // Remove sinais onde o usuário é destinatário
            const { error: toError } = await this.client
                .from('webrtc_signals')
                .delete()
                .eq('to_user_id', userId);

            if (toError) throw toError;

            return true;
        } catch (error) {
            console.error('Erro ao deletar sinais WebRTC:', error);
            throw error;
        }
    }

    async deleteUserBlocks(userId) {
        try {
            this.checkReady();
            
            // Remove bloqueios onde o usuário bloqueou alguém
            const { error: blockerError } = await this.client
                .from('user_blocks')
                .delete()
                .eq('blocker_id', userId);

            if (blockerError) throw blockerError;

            // Remove bloqueios onde o usuário foi bloqueado
            const { error: blockedError } = await this.client
                .from('user_blocks')
                .delete()
                .eq('blocked_id', userId);

            if (blockedError) throw blockedError;

            return true;
        } catch (error) {
            console.error('Erro ao deletar bloqueios:', error);
            throw error;
        }
    }

    // ========== VÍDEO CHAMADA ==========

    // SISTEMA EFÊMERO: Convites não são mais salvos no banco
    // Usa apenas Broadcast Channel + retorna objeto em memória
    async createVideoCallInvite(recipientId) {
        try {
            this.checkReady();
            
            // Obtém usuário atual
            if (!this.currentUser || !this.currentUser.id) {
                const userData = await this.getCurrentUser();
                if (!userData || !userData.user) {
                    throw new Error('Usuário não autenticado. Faça login novamente.');
                }
                this.currentUser = {
                    id: userData.user.id,
                    nickname: userData.profile?.nickname,
                    email: userData.profile?.email,
                    city: userData.profile?.city
                };
            }
            
            const userId = this.currentUser.id;

            // Cria convite em memória (não salva no banco)
            const inviteId = crypto.randomUUID();
            const invite = {
                id: inviteId,
                caller_id: userId,
                recipient_id: recipientId,
                status: 'pending',
                created_at: new Date().toISOString(),
                answered_at: null
            };

            // Envia via Broadcast Channel
            const channel = this.client.channel('video-call-invites-broadcast');
            await channel.subscribe();
            
            const { error } = await channel.send({
                type: 'broadcast',
                event: 'invite',
                payload: invite
            });

            if (error) {
                console.error('Erro ao enviar convite via broadcast:', error);
                throw error;
            }

            return invite;
        } catch (error) {
            console.error('Erro ao criar convite de vídeo chamada:', error);
            throw error;
        }
    }

    // SISTEMA EFÊMERO: Aceita convite via Broadcast (não atualiza banco)
    async acceptVideoCallInvite(inviteId) {
        try {
            this.checkReady();
            if (!this.currentUser || !this.currentUser.id) {
                const userData = await this.getCurrentUser();
                if (!userData || !userData.user) {
                    throw new Error('Usuário não autenticado');
                }
                this.currentUser = {
                    id: userData.user.id,
                    nickname: userData.profile?.nickname,
                    email: userData.profile?.email,
                    city: userData.profile?.city
                };
            }

            const userId = this.currentUser.id;
            const updatedInvite = {
                id: inviteId,
                status: 'accepted',
                answered_at: new Date().toISOString()
            };

            // Envia atualização via Broadcast
            const channel = this.client.channel('video-call-invites-broadcast');
            await channel.subscribe();
            
            const { error } = await channel.send({
                type: 'broadcast',
                event: 'invite-update',
                payload: updatedInvite
            });

            if (error) throw error;
            return updatedInvite;
        } catch (error) {
            console.error('Erro ao aceitar convite de vídeo chamada:', error);
            throw error;
        }
    }

    // SISTEMA EFÊMERO: Rejeita convite via Broadcast (não atualiza banco)
    async rejectVideoCallInvite(inviteId) {
        try {
            this.checkReady();
            if (!this.currentUser || !this.currentUser.id) {
                const userData = await this.getCurrentUser();
                if (!userData || !userData.user) {
                    throw new Error('Usuário não autenticado');
                }
                this.currentUser = {
                    id: userData.user.id,
                    nickname: userData.profile?.nickname,
                    email: userData.profile?.email,
                    city: userData.profile?.city
                };
            }

            const updatedInvite = {
                id: inviteId,
                status: 'rejected',
                answered_at: new Date().toISOString()
            };

            // Envia atualização via Broadcast
            const channel = this.client.channel('video-call-invites-broadcast');
            await channel.subscribe();
            
            const { error } = await channel.send({
                type: 'broadcast',
                event: 'invite-update',
                payload: updatedInvite
            });

            if (error) throw error;
            return updatedInvite;
        } catch (error) {
            console.error('Erro ao recusar convite de vídeo chamada:', error);
            throw error;
        }
    }

    // SISTEMA EFÊMERO: Cancela convite via Broadcast (não atualiza banco)
    async cancelVideoCallInvite(inviteId) {
        try {
            this.checkReady();
            if (!this.currentUser || !this.currentUser.id) {
                const userData = await this.getCurrentUser();
                if (!userData || !userData.user) {
                    throw new Error('Usuário não autenticado');
                }
                this.currentUser = {
                    id: userData.user.id,
                    nickname: userData.profile?.nickname,
                    email: userData.profile?.email,
                    city: userData.profile?.city
                };
            }

            const updatedInvite = {
                id: inviteId,
                status: 'cancelled'
            };

            // Envia atualização via Broadcast
            const channel = this.client.channel('video-call-invites-broadcast');
            await channel.subscribe();
            
            const { error } = await channel.send({
                type: 'broadcast',
                event: 'invite-update',
                payload: updatedInvite
            });

            if (error) throw error;
            return updatedInvite;
        } catch (error) {
            console.error('Erro ao cancelar convite de vídeo chamada:', error);
            throw error;
        }
    }

    // SISTEMA EFÊMERO: Retorna array vazio (convites não são mais salvos)
    async getPendingVideoCallInvites() {
        // Convites são gerenciados em memória via Broadcast Channels
        // Não há necessidade de buscar do banco
        return [];
    }

    // ========== WEBRTC SIGNALING ==========

    // SISTEMA EFÊMERO: Sinais WebRTC via Broadcast (não salva no banco)
    async sendWebRTCSignal(inviteId, toUserId, signalType, signalData) {
        try {
            this.checkReady();
            if (!this.currentUser || !this.currentUser.id) {
                const userData = await this.getCurrentUser();
                if (!userData || !userData.user) {
                    throw new Error('Usuário não autenticado');
                }
                this.currentUser = {
                    id: userData.user.id,
                    nickname: userData.profile?.nickname,
                    email: userData.profile?.email,
                    city: userData.profile?.city
                };
            }

            const userId = this.currentUser.id;
            const signal = {
                id: crypto.randomUUID(),
                invite_id: inviteId,
                from_user_id: userId,
                to_user_id: toUserId,
                signal_type: signalType,
                signal_data: signalData,
                created_at: new Date().toISOString()
            };

            // Envia via Broadcast Channel
            const channel = this.client.channel('webrtc-signals-broadcast');
            await channel.subscribe();
            
            const { error } = await channel.send({
                type: 'broadcast',
                event: 'signal',
                payload: signal
            });

            if (error) throw error;
            return signal;
        } catch (error) {
            console.error('Erro ao enviar sinal WebRTC:', error);
            throw error;
        }
    }

    // SISTEMA EFÊMERO: Usa Broadcast Channel em vez de postgres_changes
    subscribeToWebRTCSignals(callback) {
        try {
            this.checkReady();
            console.log('🔔 Inscrito em sinais WebRTC (Broadcast)...');
            const channel = this.client
                .channel('webrtc-signals-broadcast', {
                    config: {
                        broadcast: { self: true }
                    }
                })
                .on('broadcast', { event: 'signal' }, (payload) => {
                    console.log('📨 Sinal WebRTC recebido:', payload);
                    // Formata para compatibilidade
                    callback({
                        eventType: 'INSERT',
                        new: payload.payload
                    });
                })
                .subscribe((status) => {
                    console.log('📡 Status da inscrição em sinais WebRTC:', status);
                    if (status === 'SUBSCRIBED') {
                        console.log('✅ Inscrito com sucesso em sinais WebRTC');
                    }
                });
            return channel;
        } catch (error) {
            console.error('Erro ao inscrever-se em sinais WebRTC:', error);
            return null;
        }
    }

    // ========== REALTIME ==========

    // SISTEMA EFÊMERO: Usa Broadcast Channel em vez de postgres_changes
    subscribeToMessages(callback) {
        try {
            this.checkReady();
            
            // CORREÇÃO: Usa o mesmo canal compartilhado (reutiliza se já existir)
            if (!this.messageChannel) {
                this.messageChannel = this.client
                    .channel('messages-broadcast', {
                        config: {
                            broadcast: { self: true }
                        }
                    })
                    .on('broadcast', { event: 'message' }, (payload) => {
                        console.log('📨 Mensagem recebida via broadcast:', payload);
                        // Formata para compatibilidade com o código existente
                        callback({
                            eventType: 'INSERT',
                            new: payload.payload
                        });
                    })
                    .subscribe((status) => {
                        console.log('📡 Status da inscrição em mensagens:', status);
                        if (status === 'SUBSCRIBED') {
                            console.log('✅ Inscrito com sucesso em mensagens (Broadcast)');
                        }
                    });
            } else {
                // Se o canal já existe, apenas adiciona o listener
                this.messageChannel.on('broadcast', { event: 'message' }, (payload) => {
                    console.log('📨 Mensagem recebida via broadcast:', payload);
                    callback({
                        eventType: 'INSERT',
                        new: payload.payload
                    });
                });
            }
            
            return this.messageChannel;
        } catch (error) {
            console.error('Erro ao inscrever-se em mensagens:', error);
            return null;
        }
    }

    subscribeToProfiles(callback) {
        return this.client
            .channel('profiles')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'profiles' },
                callback
            )
            .subscribe();
    }

    subscribeToVideoCallInvites(callback) {
        try {
            this.checkReady();
            console.log('🔔 Inscrito em convites de vídeo chamada...');
            const channel = this.client
                .channel('video-call-invites-channel', {
                    config: {
                        broadcast: { self: true }
                    }
                })
                .on('postgres_changes', 
                    { 
                        event: '*', 
                        schema: 'public', 
                        table: 'video_call_invites' 
                    },
                    (payload) => {
                        console.log('📨 Payload do Realtime recebido:', payload);
                        // Normaliza o eventType para garantir compatibilidade
                        const normalizedPayload = {
                            ...payload,
                            eventType: payload.eventType || payload.event || 'UNKNOWN'
                        };
                        callback(normalizedPayload);
                    }
                )
                .subscribe((status) => {
                    console.log('📡 Status da inscrição em convites:', status);
                    if (status === 'SUBSCRIBED') {
                        console.log('✅ Inscrito com sucesso em convites de vídeo chamada');
                    } else if (status === 'CHANNEL_ERROR') {
                        console.error('❌ Erro ao se inscrever em convites de vídeo chamada');
                    }
                });
            return channel;
        } catch (error) {
            console.error('Erro ao inscrever-se em convites de vídeo chamada:', error);
            return null;
        }
    }

    unsubscribe(channel) {
        return this.client.removeChannel(channel);
    }
}

// Instância global do serviço
// Aguarda o Supabase estar pronto antes de criar
let supabaseService = null;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 50; // 10 segundos

function initSupabaseService() {
    initAttempts++;
    
    // Verifica se o Supabase está disponível e se tem o método createClient ou já está inicializado
    const isSupabaseReady = typeof window !== 'undefined' && (
        (window.supabase && typeof window.supabase.from === 'function') || // Já inicializado
        (window.supabase && typeof window.supabase.createClient === 'function') || // Tem createClient
        (typeof supabase !== 'undefined' && supabase && typeof supabase.createClient === 'function') // Global supabase
    );
    
    if (isSupabaseReady) {
        try {
            supabaseService = new SupabaseService();
            window.supabaseService = supabaseService; // Expõe globalmente
            console.log('SupabaseService criado');
        } catch (error) {
            console.error('Erro ao criar SupabaseService:', error);
            if (initAttempts < MAX_INIT_ATTEMPTS) {
                setTimeout(initSupabaseService, 200);
            }
        }
    } else {
        if (initAttempts < MAX_INIT_ATTEMPTS) {
            // Tenta novamente após um delay
            setTimeout(initSupabaseService, 200);
        } else {
            console.error('SupabaseService: Não foi possível inicializar após várias tentativas');
        }
    }
}

// Aguarda o Supabase ser inicializado
// Se initSupabaseClient foi chamado, aguarda um pouco para garantir que window.supabase está pronto
function waitForSupabaseInit() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // Aguarda um pouco para o Supabase ser inicializado
            setTimeout(initSupabaseService, 300);
        });
    } else {
        // Aguarda um pouco para o Supabase ser inicializado
        setTimeout(initSupabaseService, 300);
    }
}

// Inicia a inicialização
waitForSupabaseInit();

// Também tenta inicializar quando o Supabase for inicializado manualmente
if (typeof window !== 'undefined') {
    const originalInit = window.initSupabaseClient;
    if (originalInit) {
        window.initSupabaseClient = function() {
            const result = originalInit.apply(this, arguments);
            // Aguarda um pouco e tenta inicializar o serviço
            setTimeout(initSupabaseService, 500);
            return result;
        };
    }
}
