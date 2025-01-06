// 設定ファイルを読み込む関数
async function loadConfig() {
  try {
      const response = await fetch(chrome.runtime.getURL('.env'));
      const text = await response.text();

      // .envファイルをパース
      const config = {};
      text.split('\n').forEach(line => {
          const [key, value] = line.split('=');
          if (key && value) {
              config[key.trim()] = value.trim();
          }
      });

      return {
          GITHUB_CLIENT_ID: config.GITHUB_CLIENT_ID,
          GITHUB_CLIENT_SECRET: config.GITHUB_CLIENT_SECRET,
          CHECK_INTERVAL: 20 * 1000,  // 20秒
          REDIRECT_URL: chrome.identity.getRedirectURL()
      };
  } catch (error) {
      console.error('Failed to load config:', error);
      throw error;
  }
}

export { loadConfig };
