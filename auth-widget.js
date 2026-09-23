/* 공용 로그인 위젯 (도감 계정) — index.html / fortune.html 공용
 * 필요 스크립트: firebase-app-compat.js, firebase-auth-compat.js, /firebase-config.js
 * 사용법: 버튼을 붙일 자리에 <span data-rb-auth></span> 를 두면 자동으로 렌더됩니다.
 *   window.RBAuth.user            현재 사용자 (없으면 null)
 *   window.RBAuth.onChange(fn)    로그인 상태 변경 구독 (즉시 1회 호출)
 *   window.RBAuth.open()          로그인 모달 열기
 *   window.RBAuth.logout()
 */
(function () {
  var STR = {
    ko: {
      login: '로그인', logout: '로그아웃', title: '도감 로그인',
      desc: '도감 보유 기록과 오늘의 운세가 계정에 저장됩니다.',
      google: 'Google로 계속', or: '또는 이메일로', email: '이메일', pw: '비밀번호 (6자 이상)',
      signin: '로그인', signup: '회원가입', toSignup: '계정이 없으신가요? 회원가입',
      toSignin: '이미 계정이 있나요? 로그인', forgot: '비밀번호를 잊으셨나요?',
      needBoth: '이메일과 비밀번호를 입력하세요.', needEmail: '재설정 메일을 받을 이메일을 입력하세요.',
      resetSent: '재설정 메일을 보냈습니다. 메일함을 확인하세요.', close: '닫기'
    },
    en: {
      login: 'Log in', logout: 'Log out', title: 'Sign in',
      desc: 'Your collection and daily fortune are saved to your account.',
      google: 'Continue with Google', or: 'or with email', email: 'Email', pw: 'Password (6+ chars)',
      signin: 'Log in', signup: 'Sign up', toSignup: "Don't have an account? Sign up",
      toSignin: 'Already have an account? Log in', forgot: 'Forgot your password?',
      needBoth: 'Enter your email and password.', needEmail: 'Enter the email to receive the reset link.',
      resetSent: 'Reset email sent. Check your inbox.', close: 'Close'
    }
  };
  function lang() { return (window.LANG === 'en' || document.documentElement.lang === 'en') ? 'en' : 'ko'; }
  function t(k) { return STR[lang()][k]; }

  if (!window.firebase || !window.FIREBASE_CONFIG || !firebase.auth) return;
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  var auth = firebase.auth();

  var CSS = '' +
    '#rbAuthModal{position:fixed;inset:0;z-index:9000;display:none;align-items:center;justify-content:center;' +
      'background:rgba(3,5,11,.78);backdrop-filter:blur(6px);padding:20px}' +
    '#rbAuthModal.show{display:flex}' +
    '#rbAuthModal .box{width:100%;max-width:352px;background:#0b0f18;border:1px solid rgba(30,58,110,.3);' +
      'border-radius:18px;padding:26px 24px;box-shadow:0 24px 60px rgba(0,0,0,.6);' +
      "font-family:'Inter','Noto Sans KR',system-ui,sans-serif;position:relative}" +
    '#rbAuthModal h3{margin:0;font-size:17px;font-weight:800;color:#e8edf5;letter-spacing:-.01em}' +
    '#rbAuthModal .desc{margin:7px 0 18px;font-size:12px;line-height:1.65;color:#5a6478}' +
    '#rbAuthModal .x{position:absolute;top:14px;right:14px;background:none;border:none;color:#404a5c;' +
      'font-size:19px;cursor:pointer;line-height:1;padding:2px 5px}' +
    '#rbAuthModal .x:hover{color:#c8d0de}' +
    '#rbAuthModal .g{width:100%;display:flex;align-items:center;justify-content:center;gap:9px;padding:11px;' +
      'border-radius:11px;border:1px solid rgba(30,58,110,.3);background:#fff;color:#1f2430;font-size:13px;' +
      'font-weight:600;cursor:pointer;transition:transform .2s,box-shadow .2s;font-family:inherit}' +
    '#rbAuthModal .g:hover{transform:translateY(-1px);box-shadow:0 8px 22px rgba(0,0,0,.35)}' +
    '#rbAuthModal .div{display:flex;align-items:center;gap:10px;margin:16px 0;color:#404a5c;font-size:10.5px;' +
      "font-family:'JetBrains Mono',monospace;letter-spacing:.08em}" +
    '#rbAuthModal .div::before,#rbAuthModal .div::after{content:"";flex:1;height:1px;background:rgba(30,58,110,.28)}' +
    '#rbAuthModal input{width:100%;padding:11px 13px;margin-bottom:9px;border-radius:11px;font-size:13px;' +
      'background:#0f1219;border:1px solid rgba(30,58,110,.28);color:#e8edf5;font-family:inherit}' +
    '#rbAuthModal input:focus{outline:none;border-color:rgba(109,155,224,.55)}' +
    '#rbAuthModal .submit{width:100%;padding:11px;border-radius:11px;border:1px solid rgba(30,58,110,.35);' +
      'background:linear-gradient(135deg,#1e3a6e,#162d55);color:#d0dffa;font-size:13px;font-weight:700;' +
      'cursor:pointer;font-family:inherit;transition:all .25s}' +
    '#rbAuthModal .submit:hover{color:#fff;box-shadow:0 6px 20px rgba(30,58,110,.35)}' +
    '#rbAuthModal .sw{margin-top:13px;text-align:center;font-size:11.5px;color:#4a7bc4;cursor:pointer}' +
    '#rbAuthModal .sw:hover{color:#a0bff0}' +
    '#rbAuthModal .err{margin-top:11px;font-size:11.5px;line-height:1.6;color:#e5484d;min-height:14px;text-align:center}' +
    '.rb-auth-btn{border:1px solid rgba(30,58,110,.28);background:rgba(15,18,25,.7);color:#a0aabb;font-size:12px;' +
      'font-weight:600;padding:6px 13px;border-radius:9px;cursor:pointer;font-family:inherit;transition:all .25s;' +
      'white-space:nowrap}' +
    '.rb-auth-btn:hover{color:#e8edf5;border-color:rgba(109,155,224,.45)}' +
    '.rb-auth-user{display:inline-flex;align-items:center;gap:8px}' +
    '.rb-auth-name{font-size:11.5px;color:#7a8599;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}';

  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  var modal = document.createElement('div');
  modal.id = 'rbAuthModal';
  modal.innerHTML =
    '<div class="box">' +
      '<button class="x" data-rb-close aria-label="close">&times;</button>' +
      '<h3 id="rbAuthTitle"></h3>' +
      '<p class="desc" id="rbAuthDesc"></p>' +
      '<button class="g" id="rbGoogle">' +
        '<svg width="16" height="16" viewBox="0 0 48 48"><path fill="#4285F4" d="M45 24c0-1.6-.1-2.7-.4-4H24v7.5h12c-.2 2-1.6 5-4.6 7l7 5.4C42.6 36.2 45 30.6 45 24z"/><path fill="#34A853" d="M24 46c6 0 11-2 14.7-5.4l-7-5.4c-1.9 1.3-4.4 2.2-7.7 2.2-5.9 0-10.9-3.9-12.7-9.2l-7.3 5.6C7.6 41 15.2 46 24 46z"/><path fill="#FBBC05" d="M11.3 28.2c-.5-1.4-.8-2.8-.8-4.2s.3-2.9.7-4.2l-7.3-5.7C2.5 17 1.7 20.4 1.7 24s.8 7 2.2 9.9l7.4-5.7z"/><path fill="#EA4335" d="M24 9.5c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 2.9 30 1 24 1 15.2 1 7.6 6 4 13.9l7.4 5.7C13.1 13.4 18.1 9.5 24 9.5z"/></svg>' +
        '<span id="rbGoogleLabel"></span>' +
      '</button>' +
      '<div class="div"><span id="rbOr"></span></div>' +
      '<input type="email" id="rbEmail" autocomplete="email">' +
      '<input type="password" id="rbPw" autocomplete="current-password">' +
      '<button class="submit" id="rbSubmit"></button>' +
      '<p class="sw" id="rbSwitch"></p>' +
      '<p class="sw" id="rbForgot"></p>' +
      '<p class="err" id="rbErr"></p>' +
    '</div>';
  (document.body || document.documentElement).appendChild(modal);

  var mode = 'signin';
  var $ = function (id) { return document.getElementById(id) };

  function paint() {
    $('rbAuthTitle').textContent = t('title');
    $('rbAuthDesc').textContent = t('desc');
    $('rbGoogleLabel').textContent = t('google');
    $('rbOr').textContent = t('or');
    $('rbEmail').placeholder = t('email');
    $('rbPw').placeholder = t('pw');
    $('rbSubmit').textContent = mode === 'signup' ? t('signup') : t('signin');
    $('rbSwitch').textContent = mode === 'signup' ? t('toSignin') : t('toSignup');
    $('rbForgot').textContent = t('forgot');
  }
  function err(e) { $('rbErr').textContent = e ? (e.message || String(e)) : ''; }

  function open() { paint(); err(null); modal.classList.add('show'); setTimeout(function () { $('rbEmail').focus() }, 60); }
  function close() { modal.classList.remove('show'); }

  modal.addEventListener('click', function (e) {
    if (e.target === modal || e.target.hasAttribute('data-rb-close')) close();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close() });
  $('rbGoogle').onclick = function () {
    err(null);
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).then(close).catch(err);
  };
  $('rbSubmit').onclick = function () {
    var email = $('rbEmail').value.trim(), pw = $('rbPw').value;
    if (!email || !pw) { $('rbErr').textContent = t('needBoth'); return; }
    err(null);
    var p = mode === 'signup' ? auth.createUserWithEmailAndPassword(email, pw)
                              : auth.signInWithEmailAndPassword(email, pw);
    p.then(close).catch(err);
  };
  $('rbPw').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('rbSubmit').click() });
  $('rbSwitch').onclick = function () { mode = mode === 'signup' ? 'signin' : 'signup'; paint(); err(null); };
  $('rbForgot').onclick = function () {
    var email = $('rbEmail').value.trim();
    if (!email) { $('rbErr').textContent = t('needEmail'); return; }
    auth.sendPasswordResetEmail(email)
      .then(function () { $('rbErr').style.color = '#46a758'; $('rbErr').textContent = t('resetSent') })
      .catch(err);
  };

  var subs = [];
  var api = {
    user: null,
    open: open,
    close: close,
    logout: function () { return auth.signOut() },
    onChange: function (fn) { subs.push(fn); fn(api.user); }
  };
  window.RBAuth = api;

  function label(u) {
    return u.displayName || (u.email ? u.email.split('@')[0] : t('login'));
  }
  function renderSlots() {
    var slots = document.querySelectorAll('[data-rb-auth]');
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (api.user) {
        s.innerHTML = '<span class="rb-auth-user"><span class="rb-auth-name"></span>' +
          '<button class="rb-auth-btn" data-rb-logout></button></span>';
        s.querySelector('.rb-auth-name').textContent = label(api.user);
        s.querySelector('[data-rb-logout]').textContent = t('logout');
        s.querySelector('[data-rb-logout]').onclick = function () { api.logout() };
      } else {
        s.innerHTML = '<button class="rb-auth-btn" data-rb-login></button>';
        s.querySelector('[data-rb-login]').textContent = t('login');
        s.querySelector('[data-rb-login]').onclick = open;
      }
    }
  }
  api.render = renderSlots;

  auth.onAuthStateChanged(function (u) {
    api.user = u || null;
    renderSlots();
    for (var i = 0; i < subs.length; i++) { try { subs[i](api.user) } catch (e) { console.error(e) } }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderSlots);
  else renderSlots();
})();
