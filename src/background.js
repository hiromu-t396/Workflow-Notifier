import { loadConfig } from './config.js';
import { auth } from './auth.js';

// グローバル設定とトークンの初期化
let GITHUB_CONFIG = null;
let authToken = null;

// 初期化処理
async function initialize() {
    try {
        GITHUB_CONFIG = await loadConfig();
        // 既存のトークンがあれば読み込む
        chrome.storage.local.get(['githubToken'], (result) => {
            if (result.githubToken) {
                authToken = result.githubToken;
                startMonitoring();
            }
        });
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
}

// GitHub認証
async function authenticateWithGithub() {
  try {
      const redirectURL = chrome.identity.getRedirectURL();

      const authUrl = `https://github.com/login/oauth/authorize` +
          `?client_id=${GITHUB_CONFIG.GITHUB_CLIENT_ID}` +
          `&redirect_uri=${encodeURIComponent(redirectURL)}` +
          `&scope=repo`;

      const responseUrl = await chrome.identity.launchWebAuthFlow({
          url: authUrl,
          interactive: true
      });

      if (chrome.runtime.lastError) {
          throw new Error(chrome.runtime.lastError);
      }

      const code = new URL(responseUrl).searchParams.get('code');
      if (!code) {
          throw new Error('No auth code received');
      }

      const token = await exchangeCodeForToken(code);

      // トークンを保存
      authToken = token;
      await chrome.storage.local.set({ githubToken: token });

      return token;
  } catch (error) {
      console.error('Authentication failed:', error);
      throw error;
  }
}

// 認証コードをトークンと交換
async function exchangeCodeForToken(code) {
    const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            client_id: GITHUB_CONFIG.GITHUB_CLIENT_ID,
            client_secret: GITHUB_CONFIG.GITHUB_CLIENT_SECRET,
            code: code
        })
    });

    const data = await response.json();
    return data.access_token;
}

// ワークフローの状態をチェック

async function checkWorkflowStatus() {
  try {
      console.log('Checking workflow status...'); // デバッグログ

      const result = await chrome.storage.local.get(['watchingRepos']);
      const watchingRepos = result.watchingRepos || [];

      console.log('Watching repos:', watchingRepos); // デバッグログ

      if (!watchingRepos.length) {
          console.log('No repositories to watch'); // デバッグログ
          return;
      }

      for (const repo of watchingRepos) {
          console.log(`Checking repo: ${repo.owner}/${repo.repo}, branch: ${repo.branch}`); // デバッグログ

          const response = await fetch(
              `https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/runs?branch=${repo.branch}`,
              {
                  headers: {
                      'Authorization': `token ${await auth.getToken()}`,
                      'Accept': 'application/vnd.github.v3+json'
                  }
              }
          );

          if (!response.ok) {
              console.error(`API request failed: ${response.status}`); // エラーログ
              continue;
          }

          const data = await response.json();
          console.log('Workflow data:', data.workflow_runs?.[0]); // デバッグログ

          const latestRun = data.workflow_runs?.[0];
          if (!latestRun) continue;

          if (shouldNotify(repo, latestRun)) {
              console.log('Creating notification for:', latestRun); // デバッグログ
              createNotification(repo, latestRun);
              updateLastKnownState(repo, latestRun);
          }
      }
  } catch (error) {
      console.error('Error checking workflow status:', error);
  }
}

// 通知すべきか判断
function shouldNotify(repo, currentRun) {
  console.log('Checking notification conditions:');
  console.log('Repo state:', repo);
  console.log('Current run:', currentRun);

  // 初回は必ず通知
  if (!repo.lastKnownState) {
      console.log('First time notification - no previous state');
      return true;
  }

  // ワークフローIDが違う場合は新しい実行として扱う
  if (repo.lastKnownState.id !== currentRun.id) {
      console.log('New workflow run detected');
      return true;
  }

  const statusChanged = repo.lastKnownState.status !== currentRun.status;
  const conclusionChanged = repo.lastKnownState.conclusion !== currentRun.conclusion;

  console.log('Status changed:', statusChanged, 'Conclusion changed:', conclusionChanged);
  return statusChanged || conclusionChanged;
}

// 最後の既知の状態を更新
async function updateLastKnownState(repo, run) {
  try {
      const result = await chrome.storage.local.get('watchingRepos');
      let watchingRepos = result.watchingRepos || [];

      // 対象のリポジトリを探して状態を更新
      watchingRepos = watchingRepos.map(r => {
          // repo.name を r.repo に修正
          if (r.owner === repo.owner && r.repo === repo.repo && r.branch === repo.branch) {
              console.log('Updating state for repo:', r);
              return {
                  ...r,
                  lastKnownState: {
                      id: run.id,
                      status: run.status,
                      conclusion: run.conclusion
                  }
              };
          }
          return r;
      });

      await chrome.storage.local.set({ watchingRepos });
      console.log('Updated watching repos:', watchingRepos);
  } catch (error) {
      console.error('Error updating last known state:', error);
  }
}

// 通知作成
function createNotification(repo, run) {
  const title = `Workflow ${run.name} - ${run.conclusion}`;
  // repo.name を repo.repo に修正
  const message = `Repository: ${repo.owner}/${repo.repo}\nBranch: ${repo.branch}\nStatus: ${run.status}`;

  console.log('Creating notification:', { title, message });
  const iconUrl = chrome.runtime.getURL('public/icons/icon48.png');

  chrome.notifications.create({
      type: 'basic',
      iconUrl: iconUrl,
      title: title,
      message: message,
      priority: 2,
      requireInteraction: true
  }, (notificationId) => {
      if (chrome.runtime.lastError) {
          console.error('Notification error:', chrome.runtime.lastError);
      } else {
          console.log('Notification created with ID:', notificationId);
      }
  });
}

// 定期的なチェックを開始
function startMonitoring() {
    // 初回チェック
    checkWorkflowStatus();

    // 1分ごとにチェック（60000ミリ秒 = 1分）
    setInterval(checkWorkflowStatus, 60000);
}

// インストール時の初期化
chrome.runtime.onInstalled.addListener(() => {
    initialize();
});

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'authenticate') {
        authenticateWithGithub()
            .then(token => sendResponse({ success: true, token }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;  // 非同期レスポンスを示す
    }

    if (request.type === 'checkNow') {
        checkWorkflowStatus()
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

// エラーハンドリング
// chrome.runtime.onError.addListener(function(error) {
//   console.error('Runtime error:', error);
// });

// 初期化を実行
initialize();
