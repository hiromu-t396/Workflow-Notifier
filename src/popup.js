import { auth } from './auth.js';

// リポジトリ一覧を取得して表示
async function loadRepositories() {
   try {
       const response = await fetch('https://api.github.com/user/repos', {
           headers: {
               'Authorization': `Bearer ${await auth.getToken()}`,
               'Accept': 'application/vnd.github.v3+json'
           }
       });

       if (!response.ok) {
           throw new Error('Failed to fetch repositories');
       }

       const repos = await response.json();
       updateRepositorySelect(repos);
   } catch (error) {
       console.error('Failed to load repositories:', error);
       showError('Failed to load repositories');
   }
}

// セレクトボックスにリポジトリを追加
function updateRepositorySelect(repos) {
   const select = document.getElementById('repo-select');
   select.innerHTML = '<option value="">Select a repository</option>';

   repos.forEach(repo => {
       const option = document.createElement('option');
       option.value = `${repo.owner.login}/${repo.name}`;
       option.textContent = `${repo.owner.login}/${repo.name}`;
       select.appendChild(option);
   });
}

// リポジトリ追加処理
async function handleAddRepository() {
   const repoSelect = document.getElementById('repo-select');
   const branchInput = document.getElementById('branch');
   const addButton = document.getElementById('add-repo');

   const selectedRepo = repoSelect.value;
   const branch = branchInput.value.trim();

   if (!selectedRepo) {
       showError('Please select a repository');
       return;
   }

   if (!branch) {
       showError('Please enter a branch name');
       return;
   }

   try {
       addButton.disabled = true;

       // 監視設定を保存
       const [owner, repo] = selectedRepo.split('/');
       const watchConfig = {
           owner,
           repo,
           branch
       };

       // 既存の設定を取得して更新
       const result = await chrome.storage.local.get(['watchingRepos']);
       const watchingRepos = result.watchingRepos || [];
       watchingRepos.push(watchConfig);
       await chrome.storage.local.set({ watchingRepos });

       // フォームをリセット
       repoSelect.value = '';
       branchInput.value = '';

       // リポジトリリストを更新
       updateRepositoryList(watchingRepos);
   } catch (error) {
       console.error('Failed to add repository:', error);
       showError('Failed to add repository');
   } finally {
       addButton.disabled = false;
   }
}

async function handleRemoveRepository(owner, repo, branch) {
  try {
      // 現在の監視リポジトリリストを取得
      const result = await chrome.storage.local.get(['watchingRepos']);
      let watchingRepos = result.watchingRepos || [];

      // 指定されたリポジトリを除外
      watchingRepos = watchingRepos.filter(r =>
          !(r.owner === owner && r.repo === repo && r.branch === branch)
      );

      // 更新されたリストを保存
      await chrome.storage.local.set({ watchingRepos });

      // UIを更新
      updateRepositoryList(watchingRepos);
  } catch (error) {
      console.error('Failed to remove repository:', error);
      showError('Failed to remove repository');
  }
}

// リポジトリリストの更新表示
function updateRepositoryList(repos) {
  const repoList = document.getElementById('repo-list');
  repoList.innerHTML = '';

  repos.forEach(repo => {
      const repoElement = document.createElement('div');
      repoElement.className = 'repo-item';
      repoElement.innerHTML = `
          <div class="repo-info">
              <div class="repo-name">${repo.owner}/${repo.repo}</div>
              <div class="branch-name">Branch: ${repo.branch}</div>
          </div>
          <button class="remove-repo" data-owner="${repo.owner}" data-repo="${repo.repo}" data-branch="${repo.branch}">Remove</button>
      `;
      repoList.appendChild(repoElement);
  });

  // Remove ボタンのイベントリスナーを設定
  document.querySelectorAll('.remove-repo').forEach(button => {
      button.addEventListener('click', () => {
          const owner = button.dataset.owner;
          const repo = button.dataset.repo;
          const branch = button.dataset.branch;
          handleRemoveRepository(owner, repo, branch);
      });
  });
}

// 監視中のリポジトリ一覧を表示
async function updateWatchingRepositories() {
   try {
       const result = await chrome.storage.local.get(['watchingRepos']);
       const watchingRepos = result.watchingRepos || [];

       const repoList = document.getElementById('repo-list');
       repoList.innerHTML = '';

       watchingRepos.forEach((config, index) => {
           const item = document.createElement('div');
           item.className = 'repo-item';
           item.innerHTML = `
               <div class="repo-info">
                   <div class="repo-name">${config.owner}/${config.repo}</div>
                   <div class="branch-name">Branch: ${config.branch}</div>
               </div>
               <button class="remove-repo" data-index="${index}">Remove</button>
           `;
           repoList.appendChild(item);
       });
   } catch (error) {
       console.error('Failed to update repository list:', error);
   }
}

// DOMが読み込まれたら実行
document.addEventListener('DOMContentLoaded', async () => {
  initializeUI();
  setupEventListeners();

  const result = await chrome.storage.local.get(['watchingRepos']);
    if (result.watchingRepos) {
        updateRepositoryList(result.watchingRepos);
    }
});

// UI初期化
async function initializeUI() {
   try {
       const isAuthenticated = await auth.initialize();
       if (isAuthenticated) {
           // ユーザー情報を取得して表示
           const userInfo = await auth.getUserInfo();
           showAuthenticatedUI(userInfo.login);
       } else {
           showUnauthenticatedUI();
       }
   } catch (error) {
       console.error('Failed to initialize UI:', error);
       showUnauthenticatedUI();
   }
}

// イベントリスナーの設定
function setupEventListeners() {
   // GitHub認証ボタン
   const authButton = document.getElementById('github-auth');
   authButton.addEventListener('click', handleAuth);

   // サインアウトボタン
   const signOutButton = document.getElementById('sign-out');
   signOutButton.addEventListener('click', handleSignOut);

   // Add Repository ボタン
   const addRepoButton = document.getElementById('add-repo');
   addRepoButton.addEventListener('click', handleAddRepository);
}

// 認証ハンドラー
async function handleAuth() {
   try {
       const authButton = document.getElementById('github-auth');
       authButton.disabled = true;
       authButton.textContent = 'Signing in...';

       await auth.login();
       const userInfo = await auth.getUserInfo();
       showAuthenticatedUI(userInfo.login);
   } catch (error) {
       console.error('Authentication failed:', error);
       showError('Failed to sign in with GitHub. Please try again.');
   } finally {
       const authButton = document.getElementById('github-auth');
       authButton.disabled = false;
       authButton.textContent = 'Sign in with GitHub';
   }
}

// サインアウトハンドラー
async function handleSignOut() {
   try {
       await auth.logout();
       showUnauthenticatedUI();
   } catch (error) {
       console.error('Sign out failed:', error);
       showError('Failed to sign out. Please try again.');
   }
}

// 認証済みUIの表示
function showAuthenticatedUI(username) {
   document.getElementById('unauthorized').style.display = 'none';
   document.getElementById('authorized').style.display = 'block';
   document.getElementById('username').textContent = username;
   document.getElementById('repo-management').style.display = 'block';

   // リポジトリ一覧を読み込む
   loadRepositories();
   // 監視中のリポジトリを表示
   chrome.storage.local.get(['watchingRepos'], result => {
    if (result.watchingRepos) {
        updateRepositoryList(result.watchingRepos);
    }
});
}

// 未認証UIの表示
function showUnauthenticatedUI() {
   document.getElementById('unauthorized').style.display = 'block';
   document.getElementById('authorized').style.display = 'none';
   document.getElementById('repo-management').style.display = 'none';
}

// エラーメッセージの表示
function showError(message) {
   const errorDiv = document.createElement('div');
   errorDiv.className = 'error-message';
   errorDiv.textContent = message;

   document.querySelector('.container').prepend(errorDiv);

   // 3秒後にエラーメッセージを消す
   setTimeout(() => {
       errorDiv.remove();
   }, 3000);
}
