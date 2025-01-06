// 認証状態管理
class Auth {
  constructor() {
      this.token = null;
      this.isAuthenticated = false;
  }

  // 初期化処理
  async initialize() {
      try {
          const result = await chrome.storage.local.get(['githubToken']);
          if (result.githubToken) {
              this.token = result.githubToken;
              this.isAuthenticated = true;
              return true;
          }
          return false;
      } catch (error) {
          console.error('Failed to initialize auth:', error);
          return false;
      }
  }

  // 認証状態の確認
  async checkAuthStatus() {
      try {
          if (!this.token) {
              return false;
          }

          // トークンの有効性をGitHub APIで確認
          const response = await fetch('https://api.github.com/user', {
              headers: {
                  'Authorization': `token ${this.token}`,
                  'Accept': 'application/vnd.github.v3+json'
              }
          });

          return response.ok;
      } catch (error) {
          console.error('Auth status check failed:', error);
          return false;
      }
  }

  // ログイン処理
  async login() {
      try {
          // background.jsに認証要求を送信
          const response = await chrome.runtime.sendMessage({
              type: 'authenticate'
          });

          if (response.success && response.token) {
              this.token = response.token;
              this.isAuthenticated = true;
              return true;
          }

          throw new Error(response.error || 'Authentication failed');
      } catch (error) {
          console.error('Login failed:', error);
          throw error;
      }
  }

  // ログアウト処理
  async logout() {
      try {
          await chrome.storage.local.remove(['githubToken']);
          this.token = null;
          this.isAuthenticated = false;
          return true;
      } catch (error) {
          console.error('Logout failed:', error);
          throw error;
      }
  }

  // GitHub APIを使用するためのヘッダーを取得
  getAuthHeaders() {
      if (!this.token) {
          throw new Error('No authentication token available');
      }

      return {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json'
      };
  }

  // ユーザー情報の取得
  async getUserInfo() {
      try {
          if (!this.token) {
              throw new Error('Not authenticated');
          }

          const response = await fetch('https://api.github.com/user', {
              headers: this.getAuthHeaders()
          });

          if (!response.ok) {
              throw new Error('Failed to fetch user info');
          }

          return await response.json();
      } catch (error) {
          console.error('Failed to get user info:', error);
          throw error;
      }
  }

  // トークンを取得するメソッド
  async getToken() {
    try {
        if (this.token) {
            return this.token;
        }

        const result = await chrome.storage.local.get(['githubToken']);
        if (result.githubToken) {
            this.token = result.githubToken;
            return this.token;
        }

        throw new Error('No token available');
    } catch (error) {
        console.error('Failed to get token:', error);
        throw error;
    }
  }

  // トークンの更新
  async refreshToken() {
      try {
          return await this.login();
      } catch (error) {
          console.error('Token refresh failed:', error);
          throw error;
      }
  }

  // エラーハンドリング用のヘルパーメソッド
  async handleAuthError(error) {
      console.error('Auth error:', error);

      if (error.response && error.response.status === 401) {
          // トークンが無効になっている場合は再認証
          await this.logout();
          return await this.login();
      }

      throw error;
  }
}

// シングルトンインスタンスとしてエクスポート
export const auth = new Auth();
