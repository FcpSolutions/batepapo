// Serviço de integração com Supabase
class SupabaseService {
    constructor() {
        this.client = null;
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
            
            const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
            
            const { data, error } = await this.client
                .from('profiles')
                .select('id, nickname, city, email, last_activity')
                .gte('last_activity', thirtyMinutesAgo)
                .order('last_activity', { ascending: false });

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

    async sendMessage(messageData) {
        try {
            this.checkReady();
            
            const { data, error } = await this.client
                .from('messages')
                .insert([messageData])
                .select(`
                    *,
                    profiles!messages_user_id_fkey(nickname, city)
                `)
                .single();

            if (error) {
                console.error('Erro ao inserir mensagem no Supabase:', error);
                throw error;
            }
            
            // Formata os dados para compatibilidade
            return {
                id: data.id,
                userId: data.user_id,
                nickname: data.profiles?.nickname || 'Usuário',
                city: data.profiles?.city || '',
                content: data.content,
                type: data.type,
                mediaType: data.media_type,
                mediaData: data.media_url,
                recipientId: data.recipient_id,
                timestamp: data.created_at
            };
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            throw error;
        }
    }

    async getPublicMessages(limit = 100) {
        try {
            this.checkReady();
            const { data, error } = await this.client
                .from('messages')
                .select(`
                    *,
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
            // Busca mensagens onde userId é remetente e otherUserId é destinatário
            const { data: sentMessages, error: sentError } = await this.client
                .from('messages')
                .select(`
                    *,
                    profiles!messages_user_id_fkey(nickname, city)
                `)
                .eq('type', 'private')
                .eq('user_id', userId)
                .eq('recipient_id', otherUserId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (sentError) throw sentError;

            // Busca mensagens onde otherUserId é remetente e userId é destinatário
            const { data: receivedMessages, error: receivedError } = await this.client
                .from('messages')
                .select(`
                    *,
                    profiles!messages_user_id_fkey(nickname, city)
                `)
                .eq('type', 'private')
                .eq('user_id', otherUserId)
                .eq('recipient_id', userId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (receivedError) throw receivedError;

            // Combina e ordena todas as mensagens
            const allMessages = [...(sentMessages || []), ...(receivedMessages || [])];
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
            const fileExt = file.name.split('.').pop();
            const fileName = `${userId}/${messageId}.${fileExt}`;
            const filePath = `media/${fileName}`;

            const { data, error } = await this.client.storage
                .from('media')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) throw error;

            // Obtém URL pública
            const { data: urlData } = this.client.storage
                .from('media')
                .getPublicUrl(filePath);

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

    // ========== REALTIME ==========

    subscribeToMessages(callback) {
        try {
            this.checkReady();
            const channel = this.client
                .channel('messages-channel', {
                    config: {
                        broadcast: { self: true }
                    }
                })
                .on('postgres_changes', 
                    { 
                        event: 'INSERT', 
                        schema: 'public', 
                        table: 'messages' 
                    },
                    callback
                )
                .subscribe();
            return channel;
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
