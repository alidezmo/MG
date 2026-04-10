import { db, ref, set, get, remove } from './firebase-config.js';
import { state } from './state.js';

window.logoutApp = function() { localStorage.clear(); location.reload(); }
function generateUserIdFromName(name) { return 'user_' + name.trim().replace(/\s+/g, '_').toLowerCase(); }

const savedPass = localStorage.getItem('chat_passcode');
setTimeout(() => {
    if (state.myName && savedPass && state.myUserId) {
        if (state.myRole === 'admin') return window.startApp(); 
        get(ref(db, 'allowed_users/' + state.myUserId)).then(snap => {
            if (snap.exists() && snap.val().password === savedPass) { window.startApp(); } 
            else { remove(ref(db, 'users/' + state.myUserId)); localStorage.clear(); }
        }).catch(() => window.startApp()); 
    }
}, 0);

document.getElementById('start-btn').addEventListener('click', () => {
    const name = document.getElementById('username-input').value.trim(); const pass = document.getElementById('passcode-input').value.trim();
    if (!name || !pass) return alert("الرجاء إدخال البيانات كاملة!");
    if (name === 'المدير' && pass === 'admin') {
        const adminId = 'admin_master'; set(ref(db, 'allowed_users/' + adminId), { name: 'المدير', password: 'admin', role: 'admin' });
        localStorage.setItem('chat_username', 'المدير'); localStorage.setItem('chat_passcode', 'admin'); localStorage.setItem('chat_userid', adminId); localStorage.setItem('chat_role', 'admin');
        state.myName = 'المدير'; state.myUserId = adminId; state.myRole = 'admin'; window.startApp(); return;
    }
    get(ref(db, 'allowed_users')).then(snap => {
        const users = snap.val() || {}; let foundUser = null, foundId = null;
        for (let key in users) { if (users[key].name === name && users[key].password === pass) { foundUser = users[key]; foundId = key; break; } }
        if (foundUser) {
            localStorage.setItem('chat_username', foundUser.name); localStorage.setItem('chat_passcode', foundUser.password); localStorage.setItem('chat_userid', foundId); localStorage.setItem('chat_role', foundUser.role || 'user');
            state.myName = foundUser.name; state.myUserId = foundId; state.myRole = foundUser.role || 'user'; window.startApp();
        } else { alert("عذراً، بياناتك غير صحيحة أو لم يتم إضافتك من قِبل الإدارة بعد."); }
    });
});

window.openAdminPanel = function() { document.getElementById('admin-modal').style.display = 'flex'; window.loadUsersList(); };
window.closeAdminPanel = function() { document.getElementById('admin-modal').style.display = 'none'; };

window.adminAddUser = function() {
    const newName = document.getElementById('admin-new-name').value.trim(); const newPass = document.getElementById('admin-new-pass').value.trim();
    if(!newName || !newPass) return alert("الرجاء كتابة الاسم وكلمة المرور");
    const newId = generateUserIdFromName(newName);
    set(ref(db, 'allowed_users/' + newId), { name: newName, password: newPass, role: 'user' }).then(() => { alert("تم إضافة المستخدم بنجاح!"); document.getElementById('admin-new-name').value = ''; document.getElementById('admin-new-pass').value = ''; window.loadUsersList(); });
};

window.adminDeleteUser = function(id, name) {
    if(confirm(`هل أنت متأكد من حذف (${name}) وطرده من التطبيق؟`)) { remove(ref(db, 'allowed_users/' + id)); remove(ref(db, 'users/' + id)); window.loadUsersList(); }
};

window.cleanOldUsers = function() {
    if(confirm("سيتم فحص ومسح جميع الحسابات القديمة أو الوهمية من قاعدة البيانات. هل توافق؟")) {
        get(ref(db, 'users')).then(usersSnap => {
            get(ref(db, 'allowed_users')).then(allowedSnap => {
                const allUsers = usersSnap.val() || {}; const allowed = allowedSnap.val() || {}; let deletedCount = 0;
                for(let uid in allUsers) { if(!allowed[uid] && uid !== 'admin_master') { remove(ref(db, 'users/' + uid)); deletedCount++; } }
                alert(`تم تنظيف ومسح ${deletedCount} حساب قديم بنجاح! ✔️`); window.loadUsersList();
            });
        });
    }
};

window.loadUsersList = function() {
    get(ref(db, 'allowed_users')).then(snap => {
        const listEl = document.getElementById('admin-users-list'); listEl.innerHTML = ''; const users = snap.val() || {};
        for (let id in users) {
            if (users[id].role === 'admin') continue; 
            listEl.innerHTML += `<div class="admin-user-card"><div><strong>${users[id].name}</strong> <small style="opacity:0.6;">(كلمة السر: ${users[id].password})</small></div><button class="admin-delete-user-btn" onclick="window.adminDeleteUser('${id}', '${users[id].name}')"><i class="fa-solid fa-trash"></i> حذف</button></div>`;
        }
    });
};
