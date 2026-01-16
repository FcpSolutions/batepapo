// Gerenciamento de usuários e autenticação
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    async init() {
        // Verifica se acabou de fazer logout (evita login automático)
        const justLoggedOut = sessionStorage.getItem('justLoggedOut');
        if (justLoggedOut === 'true') {
            sessionStorage.removeItem('justLoggedOut');
            // Limpa qualquer sessão residual do Supabase
            const service = window.supabaseService || supabaseService;
            if (service && service.isReady()) {
                try {
                    await service.signOut();
                } catch (error) {
                    // Ignora erros, apenas tenta limpar
                }
            }
            // Não verifica usuário, vai direto para login
            this.setupEventListeners();
            return;
        }

        // Verifica se há usuário logado no Supabase
        const service = window.supabaseService || supabaseService;
        if (service && service.isReady()) {
            try {
                const userData = await service.getCurrentUser();
                if (userData && userData.user && userData.profile) {
                    this.currentUser = {
                        id: userData.user.id,
                        nickname: userData.profile.nickname,
                        email: userData.profile.email,
                        city: userData.profile.city
                    };
                    // Salva no sessionStorage para uso imediato
                    sessionStorage.setItem('currentUser', JSON.stringify(this.currentUser));
                }
            } catch (error) {
                // Ignora erros de sessão ausente (é normal quando não há usuário logado)
                if (error.name !== 'AuthSessionMissingError' && !error.message?.includes('session')) {
                    console.error('Erro ao verificar usuário atual:', error);
                }
            }
        }

        // Se estiver na página de chat e não houver usuário logado, redireciona
        if (window.location.pathname.includes('chat.html')) {
            if (!this.currentUser) {
                window.location.href = 'index.html';
                return;
            }
        }

        // Se estiver na página de login e já houver usuário logado, redireciona
        if (window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/')) {
            if (this.currentUser) {
                window.location.href = 'chat.html';
                return;
            }
        }

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Tabs de login/cadastro
        const tabButtons = document.querySelectorAll('.tab-btn');
        const authForms = document.querySelectorAll('.auth-form');

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                
                // Atualiza tabs
                tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Atualiza formulários
                authForms.forEach(form => form.classList.remove('active'));
                document.getElementById(`${tab}Form`).classList.add('active');

                // Limpa mensagens de erro
                this.hideError();
            });
        });

        // Formulário de login
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        // Formulário de cadastro
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRegister();
            });
        }

        // Botão de logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }
    }

    async handleLogin() {
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!email || !password) {
            this.showError('Por favor, preencha todos os campos!');
            return;
        }

        // Mostra loading
        const submitBtn = document.querySelector('#loginForm button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Entrando...';
        submitBtn.disabled = true;

        try {
            // Verifica se o SupabaseService está pronto
            const service = window.supabaseService || supabaseService;
            if (!service || !service.isReady()) {
                this.showError('Sistema ainda não está pronto. Aguarde alguns instantes e tente novamente.');
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                return;
            }

            const { user, profile } = await service.signIn(email, password);

            if (user && profile) {
                this.currentUser = {
                    id: user.id,
                    nickname: profile.nickname,
                    email: profile.email,
                    city: profile.city
                };

                // Salva no sessionStorage para uso imediato
                sessionStorage.setItem('currentUser', JSON.stringify(this.currentUser));

                window.location.href = 'chat.html';
            } else {
                this.showError('E-mail ou senha incorretos!');
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        } catch (error) {
            console.error('Erro ao fazer login:', error);
            this.showError(error.message || 'Erro ao fazer login. Tente novamente.');
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }

    async handleRegister() {
        const nickname = document.getElementById('registerNickname').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;
        const city = document.getElementById('registerCity').value.trim();

        // Validações
        if (!nickname || !email || !password || !city) {
            this.showError('Por favor, preencha todos os campos!');
            return;
        }

        if (password.length < 6) {
            this.showError('A senha deve ter pelo menos 6 caracteres!');
            return;
        }

        // Mostra loading
        const submitBtn = document.querySelector('#registerForm button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Cadastrando...';
        submitBtn.disabled = true;

        try {
            // Verifica se o SupabaseService está pronto
            const service = window.supabaseService || supabaseService;
            if (!service || !service.isReady()) {
                this.showError('Sistema ainda não está pronto. Aguarde alguns instantes e tente novamente.');
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                return;
            }

            const { user, profile } = await service.signUp(email, password, nickname, city);

            if (user && profile) {
                this.currentUser = {
                    id: user.id,
                    nickname: profile.nickname,
                    email: profile.email,
                    city: profile.city
                };

                // Salva no sessionStorage para uso imediato
                sessionStorage.setItem('currentUser', JSON.stringify(this.currentUser));

                window.location.href = 'chat.html';
            } else {
                this.showError('Erro ao criar conta. Tente novamente.');
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        } catch (error) {
            console.error('Erro ao cadastrar:', error);
            
            // Mensagens de erro mais amigáveis
            let errorMessage = 'Erro ao cadastrar. Tente novamente.';
            if (error.message) {
                if (error.message.includes('apelido') && error.message.includes('uso')) {
                    errorMessage = error.message;
                } else if (error.message.includes('already registered') || error.message.includes('already exists')) {
                    errorMessage = 'Este e-mail já está cadastrado!';
                } else if (error.message.includes('email') && (error.message.includes('already') || error.message.includes('duplicate'))) {
                    errorMessage = 'Este e-mail já está cadastrado. Tente fazer login ou use outro e-mail.';
                } else if (error.message.includes('password')) {
                    errorMessage = 'A senha deve ter pelo menos 6 caracteres!';
                } else if (error.message.includes('confirmação de e-mail') || error.message.includes('email confirm')) {
                    errorMessage = '⚠️ Confirmação de e-mail está habilitada no Supabase. Por favor, desabilite em: Authentication > Settings > Email Auth. Veja disable-email-confirmation.md para instruções.';
                } else if (error.message.includes('unique') || error.message.includes('duplicate')) {
                    if (error.message.toLowerCase().includes('nickname')) {
                        errorMessage = 'Este apelido já está em uso. Por favor, escolha outro apelido.';
                    } else {
                        errorMessage = error.message;
                    }
                } else {
                    errorMessage = error.message;
                }
            }
            
            this.showError(errorMessage);
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }

    async logout() {
        try {
            // Faz logout no Supabase
            const service = window.supabaseService || supabaseService;
            if (service && service.isReady()) {
                await service.signOut();
            }
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
        }

        // Limpa dados locais
        this.currentUser = null;
        sessionStorage.removeItem('currentUser');
        localStorage.removeItem('currentUser');
        
        window.location.href = 'index.html';
    }

    showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.classList.add('show');
            setTimeout(() => {
                errorDiv.classList.remove('show');
            }, 5000);
        }
    }

    hideError() {
        const errorDiv = document.getElementById('errorMessage');
        if (errorDiv) {
            errorDiv.classList.remove('show');
        }
    }

    getCurrentUser() {
        return this.currentUser;
    }
}

// Inicializa o gerenciador de autenticação
// Aguarda o Supabase estar pronto antes de inicializar
function initAuthManager() {
    // Verifica se o SupabaseService está disponível
    const service = window.supabaseService || (typeof supabaseService !== 'undefined' ? supabaseService : null);
    if (service && service.isReady()) {
        const authManager = new AuthManager();
        window.authManager = authManager; // Expõe globalmente
    } else {
        // Tenta novamente após um delay
        setTimeout(initAuthManager, 200);
    }
}

// Inicia quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthManager);
} else {
    initAuthManager();
}
