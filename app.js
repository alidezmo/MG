import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, push, onValue, set, update, remove, onDisconnect, query, limitToLast, onChildAdded, onChildRemoved, onChildChanged, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// ================= تسجيل الـ Service Worker =================
if ('serviceWorker' in navigator) { 
    navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then(reg => {
        console.log("Service Worker Registered!");
        navigator.serviceWorker.ready.then((registration) => {
            if (registration.active) {
                registration.active.postMessage({ type: 'CHECK_FOR_SHARED_FILE' });
            }
        });
    })
    .catch(() => console.log("Service Worker Failed")); 
    
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CHECK_FOR_SHARED_FILE' });
    }
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    document.getElementById('install-app-btn').style.display = 'block'; 
});
document.getElementById('install-app-btn').addEventListener('click', async () => {
    if (deferredPrompt) { deferredPrompt.prompt(); const { outcome } = await deferredPrompt.userChoice; if (outcome === 'accepted') { document.getElementById('install-app-btn').style.display = 'none'; } deferredPrompt = null; }
});

// ================= إعدادات Cloudinary الخاصة بك =================
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/daoenc5dp/auto/upload";
const CLOUDINARY_UPLOAD_PRESET = "Mg_home_preset";

const firebaseConfig = {
  apiKey: "AIzaSyC7-tcbiTsWceNDICdiFOYw5xX8060-lEk",
  authDomain: "home-massage-7baaa.firebaseapp.com",
  databaseURL: "https://home-massage-7baaa-default-rtdb.firebaseio.com",
  projectId: "home-massage-7baaa",
  storageBucket: "home-massage-7baaa.firebasestorage.app",
  messagingSenderId: "797052107356",
  appId: "1:797052107356:web:31df814476617ad23ac499"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ================= الوضع الليلي وعارض الصور =================
const themeBtn = document.getElementById('theme-btn');
let isDarkMode = localStorage.getItem('chat_theme') === 'dark';
function applyTheme() {
    if(isDarkMode) { document.body.classList.add('dark-theme'); themeBtn.innerHTML = '<i class="fa-solid fa-sun" style="color:#fbbf24;"></i>'; } 
    else { document.body.classList.remove('dark-theme'); themeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>'; }
}
applyTheme();
window.toggleTheme = function() { isDarkMode = !isDarkMode; localStorage.setItem('chat_theme', isDarkMode ? 'dark' : 'light'); applyTheme(); }

document.addEventListener('click', (e) => {
    if (!e.target.closest('.msg-bubble')) {
        document.querySelectorAll('.msg-menu.show').forEach(m => m.classList.remove('show'));
        document.querySelectorAll('.reaction-menu.show').forEach(m => m.classList.remove('show'));
        document.querySelectorAll('.msg-bubble').forEach(b => b.style.zIndex = '1');
    }
});

let currentImageScale = 1; let isDragging = false, startX, startY, transX = 0, transY = 0;
const lightbox = document.getElementById('lightbox'), lightboxImg = document.getElementById('lightbox-img');
window.openLightbox = function(src) { lightbox.style.display = 'flex'; lightboxImg.src = src; window.resetZoom(); }
window.closeLightbox = function() { lightbox.style.display = 'none'; lightboxImg.src = ''; }
function applyTransform() { lightboxImg.style.transform = `translate(${transX}px, ${transY}px) scale(${currentImageScale})`; }
window.zoomImage = function(step) { currentImageScale += step; if(currentImageScale < 0.5) currentImageScale = 0.5; if(currentImageScale > 5) currentImageScale = 5; applyTransform(); }
window.resetZoom = function() { currentImageScale = 1; transX = 0; transY = 0; applyTransform(); }
lightboxImg.addEventListener('mousedown', e => { isDragging = true; startX = e.clientX - transX; startY = e.clientY - transY; });
window.addEventListener('mouseup', () => { isDragging = false; });
window.addEventListener('mousemove', e => { if(!isDragging) return; e.preventDefault(); transX = e.clientX - startX; transY = e.clientY - startY; applyTransform(); });
lightboxImg.addEventListener('touchstart', e => { if(e.touches.length === 1) { isDragging = true; startX = e.touches[0].clientX - transX; startY = e.touches[0].clientY - transY; } });
window.addEventListener('touchend', () => { isDragging = false; });
window.addEventListener('touchmove', e => { if(!isDragging || e.touches.length !== 1) return; e.preventDefault(); transX = e.touches[0].clientX - startX; transY = e.touches[0].clientY - startY; applyTransform(); }, {passive: false});

// ================= التهيئة ونظام الدخول الصارم =================
let myName = localStorage.getItem('chat_username') || ''; 
let myUserId = localStorage.getItem('chat_userid') || '';
let myRole = localStorage.getItem('chat_role') || 'user'; 

let currentChatMode = 'global', currentChatTargetId = null; 
let currentMessagesRefPath = ''; 
let currentListeners = [], typingListener = null, replyingToMsg = null;
window.pendingUnreadMessages = [];
window.uploadingKeys = []; 
window.pendingAttachment = null; 

const loginScreen = document.getElementById('login-screen'), appContainer = document.getElementById('app-container');
const chatMessages = document.getElementById('chat-messages'), msgInput = document.getElementById('msg-input');
const usersListEl = document.getElementById('online-users-list');

window.toggleSidebar = function() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('sidebar-overlay').classList.toggle('active'); }
window.logoutApp = function() { localStorage.clear(); location.reload(); }
function generateUserIdFromName(name) { return 'user_' + name.trim().replace(/\s+/g, '_').toLowerCase(); }

const savedPass = localStorage.getItem('chat_passcode');
setTimeout(() => {
    if (myName && savedPass && myUserId) {
        if (myRole === 'admin') return startApp(); 
        get(ref(db, 'allowed_users/' + myUserId)).then(snap => {
            if (snap.exists() && snap.val().password === savedPass) { startApp(); } 
            else { remove(ref(db, 'users/' + myUserId)); localStorage.clear(); }
        }).catch(() => startApp()); 
    }
}, 0);

document.getElementById('start-btn').addEventListener('click', () => {
    const name = document.getElementById('username-input').value.trim();
    const pass = document.getElementById('passcode-input').value.trim();
    if (!name || !pass) return alert("الرجاء إدخال البيانات كاملة!");

    if (name === 'المدير' && pass === 'admin') {
        const adminId = 'admin_master';
        set(ref(db, 'allowed_users/' + adminId), { name: 'المدير', password: 'admin', role: 'admin' });
        localStorage.setItem('chat_username', 'المدير'); localStorage.setItem('chat_passcode', 'admin'); localStorage.setItem('chat_userid', adminId); localStorage.setItem('chat_role', 'admin');
        myName = 'المدير'; myUserId = adminId; myRole = 'admin'; startApp();
        return;
    }

    get(ref(db, 'allowed_users')).then(snap => {
        const users = snap.val() || {};
        let foundUser = null, foundId = null;
        for (let key in users) { if (users[key].name === name && users[key].password === pass) { foundUser = users[key]; foundId = key; break; } }
        if (foundUser) {
            localStorage.setItem('chat_username', foundUser.name); localStorage.setItem('chat_passcode', foundUser.password); localStorage.setItem('chat_userid', foundId); localStorage.setItem('chat_role', foundUser.role || 'user');
            myName = foundUser.name; myUserId = foundId; myRole = foundUser.role || 'user'; startApp();
        } else { alert("عذراً، بياناتك غير صحيحة أو لم يتم إضافتك من قِبل الإدارة بعد."); }
    });
});

// ================= لوحة تحكم الأدمين =================
window.openAdminPanel = function() { document.getElementById('admin-modal').style.display = 'flex'; window.loadUsersList(); };
window.closeAdminPanel = function() { document.getElementById('admin-modal').style.display = 'none'; };

window.adminAddUser = function() {
    const newName = document.getElementById('admin-new-name').value.trim(); const newPass = document.getElementById('admin-new-pass').value.trim();
    if(!newName || !newPass) return alert("الرجاء كتابة الاسم وكلمة المرور");
    const newId = generateUserIdFromName(newName);
    set(ref(db, 'allowed_users/' + newId), { name: newName, password: newPass, role: 'user' }).then(() => {
        alert("تم إضافة المستخدم بنجاح!"); document.getElementById('admin-new-name').value = ''; document.getElementById('admin-new-pass').value = ''; window.loadUsersList();
    });
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
            listEl.innerHTML += `<div class="admin-user-card"><div><strong>${users[id].name}</strong> <small style="opacity:0.6;">(كلمة السر: ${users[id].password})</small></div><button class="admin-delete-user-btn" onclick="adminDeleteUser('${id}', '${users[id].name}')"><i class="fa-solid fa-trash"></i> حذف</button></div>`;
        }
    });
};

const appStartTime = Date.now(); let unreadCounts = { global: 0 }; let trackedRooms = new Set(); 
function playNotificationSound() { document.getElementById('notification-sound').play().catch(()=>{}); }

function showInAppToast(name, text, roomType, targetId) {
    const container = document.getElementById('toast-container'); if(!container) return;
    const toast = document.createElement('div'); toast.className = 'toast-bubble';
    const firstChar = name.charAt(0).toUpperCase(); const avatarBg = roomType === 'global' ? 'var(--primary-color)' : '#10b981';
    toast.innerHTML = `<div class="private-avatar" style="width:38px; height:38px; font-size:16px; background:${avatarBg}; flex-shrink:0;">${firstChar}</div><div style="flex:1; overflow:hidden;"><strong style="display:block; font-size:13px; color:var(--primary-color);">${roomType === 'global' ? 'المجموعة العامة - ' + name : name}</strong><span style="font-size:12px; opacity:0.8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${text}</span></div>`;
    toast.onclick = () => { if (targetId !== 'system') switchChat(roomType, roomType === 'global' ? 'المجموعة العامة' : name, targetId); toast.style.animation = 'fadeOutUp 0.3s forwards'; setTimeout(() => toast.remove(), 300); };
    container.appendChild(toast); setTimeout(() => { if(toast.parentElement) { toast.style.animation = 'fadeOutUp 0.3s forwards'; setTimeout(() => toast.remove(), 300); } }, 4000);
}

window.copyMsgText = function(text) { navigator.clipboard.writeText(text).then(() => { showInAppToast('النظام', 'تم نسخ النص بنجاح ✔️', 'global', 'system'); }).catch(()=>{}); };

function handleIncomingNotification(msg, roomType, targetId) {
    if (msg.timestamp < appStartTime || msg.name === myName) return; 
    if (!(currentChatMode === roomType && currentChatTargetId === targetId)) {
        const badgeId = roomType === 'global' ? 'global' : targetId; unreadCounts[badgeId] = (unreadCounts[badgeId] || 0) + 1;
        const badgeEl = document.getElementById('badge-' + badgeId); if (badgeEl) { badgeEl.innerText = unreadCounts[badgeId]; badgeEl.style.display = 'flex'; }
        playNotificationSound();
        let notifBody = msg.type === 'text' ? msg.content : (msg.type === 'audio' ? '🎤 أرسل رسالة صوتية' : '📁 أرسل ملفاً/صورة');
        if ('setAppBadge' in navigator) navigator.setAppBadge(Object.values(unreadCounts).reduce((a, b) => a + b, 0)).catch(()=>{});
        if (document.hidden && Notification.permission === "granted") { const notification = new Notification(roomType === 'global' ? `المجموعة العامة - ${msg.name}` : `رسالة من ${msg.name}`, { body: notifBody, icon: './icon.svg' }); notification.onclick = function() { window.focus(); this.close(); }; } 
        else if (!document.hidden) showInAppToast(msg.name, notifBody, roomType, targetId);
    }
}

function listenForNotifications(roomRefPath, roomType, targetId) {
    if (trackedRooms.has(roomRefPath)) return; trackedRooms.add(roomRefPath);
    onChildAdded(query(ref(db, roomRefPath), limitToLast(100)), snapshot => handleIncomingNotification(snapshot.val(), roomType, targetId));
}

function startApp() {
    loginScreen.style.display = 'none'; appContainer.style.display = 'flex';
    document.getElementById('my-name-display').innerText = myName; document.getElementById('my-avatar').innerText = myName.charAt(0).toUpperCase();
    if (myRole === 'admin') { document.getElementById('admin-panel-btn').style.display = 'block'; }
    registerInFirebase(); listenForNotifications('messages_global', 'global', 'global'); switchChat('global', 'المجموعة العامة');
    
   // تفعيل OneSignal وطلب الصلاحية فوراً
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalDeferred.push(async function(OneSignal) {
        await OneSignal.init({
            appId: "c89a2d04-de43-42eb-85b3-2f45c47b6b08",
            safari_web_id: "web.onesignal.auto.1afe2633-50cf-455e-8f3e-a50d8cbe1d12",
            // إظهار زرار الجرس الصغير تحت
            notifyButton: { enable: true },
        });
        
        // ربط الموبايل باليوزر ده عشان يوصله الإشعار الخاص
        OneSignal.login(myUserId); 
        
        // السطر السحري اللي هيطلع رسالة طلب الصلاحية للمستخدم أول ما يفتح الشات
        OneSignal.Slidedown.promptPush(); 
    });
}

function timeAgo(timestamp) {
    if (!timestamp) return 'غير متصل';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'منذ لحظات'; const minutes = Math.floor(seconds / 60); if (minutes < 60) return `آخر ظهور منذ ${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60); if (hours < 24) return `آخر ظهور منذ ${hours} ساعة`; return `آخر ظهور منذ ${Math.floor(hours / 24)} يوم`;
}

function registerInFirebase() {
    const myUserRef = ref(db, 'users/' + myUserId); const connectedRef = ref(db, '.info/connected');
    onValue(connectedRef, snap => { if (snap.val() === true) { update(myUserRef, { name: myName, userId: myUserId, online: true, lastSeen: Date.now() }); onDisconnect(myUserRef).update({ online: false, lastSeen: Date.now() }); } });
    onValue(ref(db, 'users'), snapshot => {
        const allUsers = snapshot.val() || {}; usersListEl.innerHTML = ''; 
        const usersArray = Object.values(allUsers).filter(u => u.userId !== myUserId);
        usersArray.sort((a, b) => (b.online === a.online) ? 0 : b.online ? 1 : -1);
        usersArray.forEach(u => {
            const roomID = myUserId < u.userId ? `${myUserId}_${u.userId}` : `${u.userId}_${myUserId}`; listenForNotifications(`messages_private/${roomID}`, 'private', u.userId);
            const firstChar = u.name.charAt(0).toUpperCase(); const isActiveChat = currentChatTargetId === u.userId ? 'active-chat' : '';
            const statusClass = u.online ? 'status-online' : 'status-offline'; const statusText = u.online ? 'متصل الآن' : timeAgo(u.lastSeen); const avatarClass = u.online ? '' : 'avatar-offline';
            const div = document.createElement('div'); div.className = `user-item ${isActiveChat}`; div.id = `chat-btn-${u.userId}`;
            div.innerHTML = `<div class="private-avatar ${avatarClass}" style="background:${u.online ? '#10b981' : '#6b7280'};">${firstChar}</div><div style="flex:1;"><strong style="display:block; color:var(--text-color); font-size:15px;">${u.name}</strong><small class="${statusClass}">${statusText}</small></div><div class="unread-badge" id="badge-${u.userId}">0</div>`;
            div.onclick = () => { switchChat('private', u.name, u.userId); if(window.innerWidth <= 768) toggleSidebar(); };
            usersListEl.appendChild(div);
            if(unreadCounts[u.userId] > 0) { document.getElementById('badge-' + u.userId).innerText = unreadCounts[u.userId]; document.getElementById('badge-' + u.userId).style.display = 'flex'; }
        });
    });
}

window.switchChat = function(mode, title, targetId = null) {
    currentChatMode = mode; currentChatTargetId = targetId; window.cancelReply(); window.cancelAttachment();
    
    const badgeId = mode === 'global' ? 'global' : targetId; unreadCounts[badgeId] = 0; if (document.getElementById(`badge-${badgeId}`)) document.getElementById(`badge-${badgeId}`).style.display = 'none';
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active-chat'));
    const activeBtn = mode === 'global' ? document.getElementById('chat-btn-global') : document.getElementById(`chat-btn-${targetId}`); if(activeBtn) activeBtn.classList.add('active-chat');
    
    document.getElementById('chat-title').innerText = title; document.getElementById('header-icon').innerHTML = mode === 'global' ? '<i class="fa-solid fa-earth-americas"></i>' : title.charAt(0).toUpperCase(); document.getElementById('header-icon').style.background = mode === 'global' ? 'var(--primary-color)' : '#10b981';
    
    if (mode === 'global' && myRole !== 'admin') { document.getElementById('clear-chat-btn').style.display = 'none'; } 
    else { document.getElementById('clear-chat-btn').style.display = 'flex'; }

    currentListeners.forEach(unsub => unsub()); currentListeners = []; if(typingListener) { typingListener(); typingListener = null; } chatMessages.innerHTML = ''; 
    
    const roomID = mode === 'global' ? 'global' : (myUserId < targetId ? `${myUserId}_${targetId}` : `${targetId}_${myUserId}`);
    currentMessagesRefPath = mode === 'global' ? 'messages_global' : `messages_private/${roomID}`;
    const refQuery = query(ref(db, currentMessagesRefPath), limitToLast(100));

    currentListeners.push(onChildAdded(refQuery, (snapshot) => {
        const msg = snapshot.val(); renderMsg(snapshot.key, msg, msg.name === myName);
        if (msg.name !== myName && currentChatMode === 'private' && (!msg.readBy || !msg.readBy[myUserId])) {
            if (!document.hidden) update(ref(db, `${currentMessagesRefPath}/${snapshot.key}`), { [`readBy/${myUserId}`]: true }); else window.pendingUnreadMessages.push(`${currentMessagesRefPath}/${snapshot.key}`);
        }
    }));
    currentListeners.push(onChildChanged(refQuery, (snapshot) => { const msg = snapshot.val(); const statusIcon = document.getElementById('status-' + snapshot.key); if (statusIcon && msg.readBy) statusIcon.className = "fa-solid fa-check-double status-read"; updateReactionsUI(snapshot.key, msg.reactions); }));
    currentListeners.push(onChildRemoved(refQuery, (snapshot) => { const el = document.getElementById('msg-' + snapshot.key); if(el) { el.style.animation = 'fadeIn 0.3s ease reverse'; setTimeout(() => el.remove(), 250); } }));

    typingListener = onValue(ref(db, `typing/${roomID}`), snapshot => {
        let anyoneTyping = false, typingName = ''; snapshot.forEach(child => { if(child.key !== myUserId && child.val().isTyping) { anyoneTyping = true; typingName = child.val().name; } });
        document.getElementById('chat-subtitle').innerHTML = anyoneTyping ? `<span class="typing-indicator">${typingName} يكتب...</span>` : 'مشفر بالكامل';
    });
};

document.getElementById('clear-chat-btn').addEventListener('click', () => {
    if (!currentMessagesRefPath) return;
    if (currentChatMode === 'global' && myRole !== 'admin') return; 
    if (confirm("هل أنت متأكد من مسح المحادثة بالكامل للجميع؟")) { remove(ref(db, currentMessagesRefPath)).then(() => alert("تم مسح المحادثة بنجاح!")).catch(() => alert("حدث خطأ أثناء المسح.")); }
});

window.addEventListener('focus', () => {
    if (window.pendingUnreadMessages && window.pendingUnreadMessages.length > 0) {
        window.pendingUnreadMessages.forEach(fullPath => { update(ref(db, fullPath), { [`readBy/${myUserId}`]: true }); }); window.pendingUnreadMessages = []; 
        if (currentChatMode === 'private' && currentChatTargetId) { unreadCounts[currentChatTargetId] = 0; const badgeEl = document.getElementById('badge-' + currentChatTargetId); if (badgeEl) badgeEl.style.display = 'none'; }
    }
    if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(()=>{});
});

window.toggleMsgMenu = function(key) {
    const menu = document.getElementById('menu-' + key); const bubble = document.getElementById('msg-' + key); const isShowing = menu.classList.contains('show');
    document.querySelectorAll('.msg-menu.show').forEach(m => m.classList.remove('show')); document.querySelectorAll('.reaction-menu.show').forEach(m => m.classList.remove('show')); document.querySelectorAll('.msg-bubble').forEach(b => b.style.zIndex = '1');
    if (!isShowing) { menu.classList.add('show'); if(bubble) bubble.style.zIndex = '100'; }
};

window.toggleReactMenu = function(key) {
    const menu = document.getElementById('react-' + key); const bubble = document.getElementById('msg-' + key); const isShowing = menu.classList.contains('show');
    document.querySelectorAll('.msg-menu.show').forEach(m => m.classList.remove('show')); document.querySelectorAll('.reaction-menu.show').forEach(m => m.classList.remove('show')); document.querySelectorAll('.msg-bubble').forEach(b => b.style.zIndex = '1');
    if (!isShowing) { menu.classList.add('show'); if(bubble) bubble.style.zIndex = '100'; }
}

window.addReaction = function(msgKey, emoji) { update(ref(db, `${currentMessagesRefPath}/${msgKey}/reactions`), { [myUserId]: emoji }); document.querySelectorAll('.reaction-menu.show').forEach(m => m.classList.remove('show')); };

function updateReactionsUI(msgKey, reactionsObj) {
    const displayEl = document.getElementById('reactions-display-' + msgKey); if (!displayEl) return;
    if (!reactionsObj) { displayEl.classList.add('hidden'); return; }
    const emojiCounts = {}; Object.values(reactionsObj).forEach(emoji => { emojiCounts[emoji] = (emojiCounts[emoji] || 0) + 1; });
    let html = ''; Object.keys(emojiCounts).forEach(emoji => { html += `<span>${emoji}</span>`; });
    if (Object.keys(reactionsObj).length > 1) html += `<span style="font-size:10px; margin-right:3px; opacity:0.8;">${Object.keys(reactionsObj).length}</span>`;
    displayEl.innerHTML = html; displayEl.classList.remove('hidden');
}

window.deleteMsg = function(msgKey) { if(confirm("حذف الرسالة لدى الجميع؟")) remove(ref(db, `${currentMessagesRefPath}/${msgKey}`)); };
window.prepareReply = function(name, textExcerpt) { replyingToMsg = { name: name, text: textExcerpt }; document.getElementById('reply-preview-box').style.display = 'block'; document.getElementById('reply-preview-name').innerText = name; document.getElementById('reply-preview-text').innerText = textExcerpt; msgInput.focus(); };
window.cancelReply = function() { replyingToMsg = null; document.getElementById('reply-preview-box').style.display = 'none'; };

window.cancelAttachment = function() {
    window.pendingAttachment = null; document.getElementById('file-preview-box').style.display = 'none';
};

function showAttachmentPreview(file, dataUrl) {
    window.pendingAttachment = {
        fileObj: file,
        fileName: file.name, 
        content: dataUrl, 
        type: 'file',
        isImage: dataUrl.startsWith('data:image/'), 
        isVideo: dataUrl.startsWith('data:video/')
    };
    document.getElementById('file-preview-box').style.display = 'block'; document.getElementById('attachment-name').innerText = file.name;
    const thumb = document.getElementById('attachment-thumb'), icon = document.getElementById('attachment-icon');
    if (window.pendingAttachment.isImage || window.pendingAttachment.isVideo) {
        thumb.src = window.pendingAttachment.isVideo ? 'https://cdn-icons-png.flaticon.com/512/4404/4404094.png' : dataUrl;
        thumb.style.display = 'block'; icon.style.display = 'none';
    } else { thumb.style.display = 'none'; icon.style.display = 'block'; }
    msgInput.focus();
}

const fileInput = document.getElementById('file-input');
document.getElementById('attach-btn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
    const file = fileInput.files[0]; if (!file) return; 
    if (file.size > 50 * 1024 * 1024) return alert("الحد الأقصى 50 ميجابايت."); 
    const reader = new FileReader(); reader.onload = e => showAttachmentPreview(file, e.target.result); reader.readAsDataURL(file); fileInput.value = '';
});

navigator.serviceWorker.addEventListener('message', event => {
    if (event.data.type === 'FILE_SHARED_FROM_OS' && event.data.file) {
        const file = event.data.file; 
        if (file.size > 50 * 1024 * 1024) return alert("الحد الأقصى 50 ميجابايت."); 
        const reader = new FileReader(); 
        reader.onload = e => { showAttachmentPreview(file, e.target.result); }; 
        reader.readAsDataURL(file);
    }
});

msgInput.addEventListener('input', function() {
    this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px'; if(!currentMessagesRefPath) return;
    const roomID = currentChatMode === 'global' ? 'global' : (myUserId < currentChatTargetId ? `${myUserId}_${currentChatTargetId}` : `${currentChatTargetId}_${myUserId}`);
    set(ref(db, `typing/${roomID}/${myUserId}`), { name: myName, isTyping: true }); clearTimeout(window.typingTimeout); window.typingTimeout = setTimeout(() => set(ref(db, `typing/${roomID}/${myUserId}`), { name: myName, isTyping: false }), 1500);
});

function renderTempMsg(msgKey, msgObj) {
    const div = document.createElement('div'); div.id = 'msg-' + msgKey; div.className = `msg-bubble msg-me`;
    div.style.opacity = '0.7'; let htmlContent = '';
    
    if (msgObj.type === 'file') {
        const fName = (msgObj.fileName || '').toLowerCase();
        const isPdf = fName.endsWith('.pdf');
        const isDoc = fName.match(/\.(doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar)$/i);
        const isFile = isPdf || isDoc;
        
        const isImg = !isFile && (msgObj.content.startsWith('data:image/') || fName.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i) || msgObj.content.includes('/image/upload/'));
        const isVid = !isFile && (msgObj.content.startsWith('data:video/') || fName.match(/\.(mp4|webm|ogg|mov)$/i) || msgObj.content.includes('/video/upload/'));
        
        if (isImg) htmlContent = `<div style="position:relative;"><img src="${msgObj.content}" class="image-preview"><div id="overlay-${msgKey}" class="temp-msg-overlay"><i class="fa-solid fa-circle-notch temp-spinner"></i></div></div>`;
        else if (isVid) htmlContent = `<div style="position:relative;"><video src="${msgObj.content}" style="max-width:100%; border-radius:12px;"></video><div id="overlay-${msgKey}" class="temp-msg-overlay"><i class="fa-solid fa-circle-notch temp-spinner"></i></div></div>`;
        else htmlContent = `<div style="position:relative;" class="file-box"><div style="display:flex; align-items:center; gap:10px;"><i class="fa-solid ${isPdf ? 'fa-file-pdf' : 'fa-file'}" style="font-size:30px; color:${isPdf ? '#ef4444' : 'var(--primary-color)'};"></i> <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; font-weight:bold;">${msgObj.fileName}</div></div><div id="overlay-${msgKey}" class="temp-msg-overlay"><i class="fa-solid fa-circle-notch temp-spinner"></i></div></div>`;
    } else if (msgObj.type === 'audio') {
        htmlContent = `<div style="position:relative;"><div class="custom-audio-player"><button class="play-btn"><i class="fa-solid fa-play"></i></button><div class="audio-progress"></div><div class="audio-time">${msgObj.durationText}</div></div><div id="overlay-${msgKey}" class="temp-msg-overlay"><i class="fa-solid fa-circle-notch temp-spinner"></i></div></div>`;
    }

    let captionHtml = msgObj.caption ? `<div style="margin-top:8px; font-size:14px;">${msgObj.caption}</div>` : '';
    div.innerHTML = `<div>${htmlContent}</div>${captionHtml}<div class="msg-meta">جاري الإرسال... <i class="fa-regular fa-clock"></i></div>`;
    document.getElementById('chat-messages').appendChild(div); 
    setTimeout(() => { document.getElementById('chat-messages').scrollTo({ top: document.getElementById('chat-messages').scrollHeight, behavior: 'smooth' }); }, 100);
}

// ================= نظام الإشعارات الحقيقية (OneSignal) =================
function sendRealPushNotification(targetId, title, message) {
    const REST_API_KEY = "os_v2_app_zcnc2bg6inboxbntf5c4i63lbahjebt6rpyesuushnigpfbyqp3vzbcoeyd7blnpj6zjwt2e6vqedjf3wdy226rvvgbkx4natfamufa"; 
    
    if (!REST_API_KEY) return;

    const data = {
        app_id: "c89a2d04-de43-42eb-85b3-2f45c47b6b08",
        headings: { "en": title, "ar": title },
        contents: { "en": message, "ar": message },
    };

    if (targetId === 'global') {
        data.included_segments = ["Subscribed Users"]; 
    } else {
        data.include_aliases = { external_id: [targetId] }; 
    }

    fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": "Basic " + REST_API_KEY
        },
        body: JSON.stringify(data)
    }).catch(e => console.log("Push Error", e));
}

async function sendMessage(dataObj) {
    if(!currentMessagesRefPath) return; 
    dataObj.name = myName; dataObj.timestamp = Date.now(); if(replyingToMsg) dataObj.replyTo = replyingToMsg;
    
    const newRef = push(ref(db, currentMessagesRefPath));
    const msgKey = newRef.key;
    
    if (dataObj.rawFile) {
        window.uploadingKeys.push(msgKey);
        renderTempMsg(msgKey, dataObj);

        const formData = new FormData();
        formData.append('file', dataObj.rawFile);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        try {
            const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
            const uploadData = await response.json();

            if (uploadData.secure_url) {
                dataObj.content = uploadData.secure_url; 
                delete dataObj.rawFile; 

                await set(newRef, dataObj);
                window.uploadingKeys = window.uploadingKeys.filter(k => k !== msgKey);
                const overlay = document.getElementById('overlay-' + msgKey); if(overlay) overlay.remove();
            } else {
                throw new Error("Cloudinary Error");
            }
        } catch (err) {
            window.uploadingKeys = window.uploadingKeys.filter(k => k !== msgKey);
            const overlay = document.getElementById('overlay-' + msgKey); if(overlay) overlay.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444; font-size:30px;"></i>';
            alert("حدث خطأ أثناء رفع الملف!");
            return;
        }
    } else {
        await set(newRef, dataObj);
    }

    const roomID = currentChatMode === 'global' ? 'global' : (myUserId < currentChatTargetId ? `${myUserId}_${currentChatTargetId}` : `${currentChatTargetId}_${myUserId}`);
    set(ref(db, `typing/${roomID}/${myUserId}`), { name: myName, isTyping: false }); window.cancelReply(); 

    // استدعاء إشعار الموبايل الحقيقي
    let pushText = dataObj.type === 'text' ? dataObj.content : (dataObj.type === 'audio' ? '🎤 رسالة صوتية' : '📁 ملف مرفق');
    let targetForPush = currentChatMode === 'global' ? 'global' : currentChatTargetId;
    sendRealPushNotification(targetForPush, myName, pushText);
            
    msgInput.style.height = 'auto';
}

document.getElementById('send-btn').addEventListener('click', () => { 
    const text = msgInput.value.trim(); 
    if(text || window.pendingAttachment) { 
        if (window.pendingAttachment) {
            sendMessage({ 
                type: 'file', 
                fileName: window.pendingAttachment.fileName, 
                content: window.pendingAttachment.content, 
                rawFile: window.pendingAttachment.fileObj, 
                caption: text 
            });
            window.cancelAttachment();
        } else {
            sendMessage({ type: 'text', content: text }); 
        }
        msgInput.value = ''; 
        msgInput.style.height = 'auto';
        msgInput.blur(); 
        setTimeout(() => { 
            const chatBox = document.getElementById('chat-messages');
            chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' }); 
        }, 200);
    }
});
msgInput.addEventListener('keypress', (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('send-btn').click(); } });

window.toggleAudio = function(id) { const audio = document.getElementById(id), icon = document.getElementById('icon-' + id); if (audio.paused) { document.querySelectorAll('audio').forEach(a => { if (a.id !== id && a.id !== 'notification-sound' && !a.paused) { a.pause(); document.getElementById('icon-' + a.id).className = 'fa-solid fa-play'; } }); audio.play(); icon.className = 'fa-solid fa-pause'; } else { audio.pause(); icon.className = 'fa-solid fa-play'; } };
window.updateAudioProgress = function(id) { const audio = document.getElementById(id), progress = document.getElementById('progress-' + id), timeEl = document.getElementById('time-' + id); if(audio.duration) { progress.style.width = ((audio.currentTime / audio.duration) * 100) + '%'; timeEl.innerText = `${String(Math.floor(audio.currentTime / 60)).padStart(2, '0')}:${String(Math.floor(audio.currentTime % 60)).padStart(2, '0')}`; } };
window.audioEnded = function(id) { document.getElementById('icon-' + id).className = 'fa-solid fa-play'; document.getElementById('progress-' + id).style.width = '0%'; document.getElementById('time-' + id).innerText = document.getElementById('time-' + id).getAttribute('data-duration'); };

let mediaRecorder, audioChunks = [], recordTimer, recordingSeconds = 0, lastRecordedTimeString = "00:00", activeMediaStream = null; 
const normalUI = document.getElementById('normal-input-ui'), recordingUI = document.getElementById('recording-ui'), recordTimerEl = document.getElementById('record-timer');
function releaseMicrophone() { if (activeMediaStream) { activeMediaStream.getTracks().forEach(track => track.stop()); activeMediaStream = null; } }
function hideRecordingUI() { clearInterval(recordTimer); recordingUI.style.display = 'none'; normalUI.style.display = 'flex'; document.getElementById('send-btn').style.display = 'flex'; }

document.getElementById('mic-btn').addEventListener('click', async () => {
    try { activeMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true }); mediaRecorder = new MediaRecorder(activeMediaStream); audioChunks = []; mediaRecorder.ondataavailable = e => { if(e.data.size > 0) audioChunks.push(e.data); }; normalUI.style.display = 'none'; document.getElementById('send-btn').style.display = 'none'; recordingUI.style.display = 'flex'; recordingSeconds = 0; lastRecordedTimeString = "00:00"; recordTimerEl.innerText = "00:00"; recordTimer = setInterval(() => { recordingSeconds++; lastRecordedTimeString = `${String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:${String(Math.floor(recordingSeconds % 60)).padStart(2, '0')}`; recordTimerEl.innerText = lastRecordedTimeString; }, 1000); mediaRecorder.start(); } catch(err) { alert('الرجاء السماح بصلاحية الميكروفون!'); }
});
document.getElementById('cancel-record-btn').addEventListener('click', () => { if(mediaRecorder && mediaRecorder.state !== "inactive") { mediaRecorder.onstop = null; mediaRecorder.stop(); } hideRecordingUI(); releaseMicrophone(); });
document.getElementById('send-record-btn').addEventListener('click', () => { 
    if(mediaRecorder && mediaRecorder.state !== "inactive") { 
        mediaRecorder.onstop = () => { 
            const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' }); 
            const reader = new FileReader(); 
            reader.onloadend = () => { 
                sendMessage({ 
                    type: 'audio', 
                    content: reader.result, 
                    rawFile: audioBlob,     
                    durationText: lastRecordedTimeString 
                }); 
                releaseMicrophone(); 
            }; 
            reader.readAsDataURL(audioBlob); 
        }; 
        mediaRecorder.stop(); 
    } 
    hideRecordingUI(); 
});

function processTextForLinks(text) {
    let safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;"); 
    let ytVideoId = null; const ytMatch = safeText.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch && ytMatch[1]) { ytVideoId = ytMatch[1]; }
    let formattedText = safeText.replace(/(https?:\/\/[^\s]+)/g, url => `<a href="${url}" target="_blank">${url}</a>`).replace(/\n/g, '<br>');
    
    if (ytVideoId) formattedText += `<div class="yt-preview"><iframe src="https://www.youtube.com/embed/${ytVideoId}" allow="fullscreen" allowfullscreen style="border:none; width:100%; height:100%; position:absolute; top:0; left:0;"></iframe></div>`;
    return formattedText;
}

function renderMsg(msgKey, msgObj, isMe) {
    const existingDiv = document.getElementById('msg-' + msgKey);
    if (existingDiv) existingDiv.remove(); 

    const div = document.createElement('div'); div.id = 'msg-' + msgKey; div.className = `msg-bubble ${isMe ? 'msg-me' : 'msg-other'}`;
    let htmlContent = '', textExcerptForReply = '', safeContentToCopy = ''; 
    let quoteHtml = ''; if(msgObj.replyTo) quoteHtml = `<div class="quoted-msg" onclick="prepareReply('${msgObj.name}', '${msgObj.content ? 'نص' : 'مرفق'}')"><strong>${msgObj.replyTo.name}</strong><div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${msgObj.replyTo.text}</div></div>`;

    let overlayHtml = (window.uploadingKeys && window.uploadingKeys.includes(msgKey)) ? `<div id="overlay-${msgKey}" class="temp-msg-overlay"><i class="fa-solid fa-circle-notch temp-spinner"></i></div>` : '';

    if (msgObj.type === 'text') { 
        htmlContent = processTextForLinks(msgObj.content); 
        textExcerptForReply = msgObj.content; 
        safeContentToCopy = msgObj.content.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n'); 
    } 
    else if (msgObj.type === 'file') { 
        let captionHtml = msgObj.caption ? `<div style="margin-top:8px; font-size:14px;">${processTextForLinks(msgObj.caption)}</div>` : '';
        
        let viewUrl = msgObj.content;
        let downloadUrl = msgObj.content;
        if (downloadUrl.includes('cloudinary.com') && downloadUrl.includes('/upload/')) {
            downloadUrl = downloadUrl.replace('/upload/', '/upload/fl_attachment/');
        }

        const fName = (msgObj.fileName || '').toLowerCase();
        const isPdf = fName.endsWith('.pdf');
        const isDoc = fName.match(/\.(doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar)$/i);
        const isFile = isPdf || isDoc;

        if ((isPdf || isDoc) && !fName.match(/\.(zip|rar)$/i)) {
            viewUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(msgObj.content)}`;
        }

        const isImg = !isFile && (msgObj.content.startsWith('data:image/') || fName.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i) || msgObj.content.includes('/image/upload/'));
        const isVid = !isFile && (msgObj.content.startsWith('data:video/') || fName.match(/\.(mp4|webm|ogg|mov)$/i) || msgObj.content.includes('/video/upload/'));

        if (isImg) { 
            htmlContent = `
                <div style="position:relative;">
                    <img src="${msgObj.content}" class="image-preview" onclick="openLightbox(this.src)">
                    ${overlayHtml}
                </div>
                ${captionHtml}
                <div style="display:flex; justify-content:flex-start; margin-top: 5px;">
                    <a href="${downloadUrl}" download="${msgObj.fileName || 'image.png'}" class="media-download-btn"><i class="fa-solid fa-download"></i> تحميل الصورة</a>
                </div>
            `; 
            textExcerptForReply = '📷 صورة' + (msgObj.caption ? ` - ${msgObj.caption}` : ''); 
        } 
        else if (isVid) {
            htmlContent = `
                <div style="position:relative;">
                    <video src="${msgObj.content}" controls playsinline webkit-playsinline style="max-width: 100%; border-radius: 12px; margin-top: 5px; border: 1px solid var(--border-color); background: #000;"></video>
                    ${overlayHtml}
                </div>
                ${captionHtml}
                <div style="display:flex; justify-content:flex-start; margin-top: 5px;">
                    <a href="${downloadUrl}" download="${msgObj.fileName || 'video.mp4'}" class="media-download-btn"><i class="fa-solid fa-download"></i> تحميل الفيديو</a>
                </div>
            `;
            textExcerptForReply = '🎥 فيديو' + (msgObj.caption ? ` - ${msgObj.caption}` : '');
        }
        else { 
            htmlContent = `
                <div class="file-box">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom: 10px;">
                        <i class="fa-solid ${isPdf ? 'fa-file-pdf' : 'fa-file'}" style="font-size:30px; color: ${isPdf ? '#ef4444' : 'var(--primary-color)'};"></i>
                        <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; font-weight:bold; font-size:14px; line-height: 1.4;">
                            ${msgObj.fileName || 'ملف مرفق'}
                        </div>
                    </div>
                    ${overlayHtml}
                    <div style="display:flex; gap: 8px;">
                        <a href="${viewUrl}" target="_blank" class="media-download-btn" style="flex:1; justify-content:center; background:var(--primary-color) !important; color:white !important; border:none;"><i class="fa-solid fa-eye"></i> عرض</a>
                        <a href="${downloadUrl}" download="${msgObj.fileName}" class="media-download-btn" style="flex:1; justify-content:center;"><i class="fa-solid fa-download"></i> تحميل</a>
                    </div>
                </div>
                ${captionHtml}
            `; 
            textExcerptForReply = '📁 ملف'; 
        } 
    } 
    else if (msgObj.type === 'audio') { 
        const audioId = 'audio-' + msgKey; const durationText = msgObj.durationText || '00:00'; 
        htmlContent = `<div style="position:relative;"><div class="custom-audio-player"><button class="play-btn" onclick="toggleAudio('${audioId}')"><i class="fa-solid fa-play" id="icon-${audioId}"></i></button><div class="audio-progress"><div class="progress-bar" id="progress-${audioId}"></div></div><div class="audio-time" id="time-${audioId}" data-duration="${durationText}">${durationText}</div><audio id="${audioId}" src="${msgObj.content}" style="display:none;" ontimeupdate="updateAudioProgress('${audioId}')" onended="audioEnded('${audioId}')"></audio></div>${overlayHtml}</div>`; 
        textExcerptForReply = '🎤 صوت'; 
    }

    const showDeleteBtn = isMe || myRole === 'admin';
    let actionsHtml = `<div class="msg-options" onclick="toggleMsgMenu('${msgKey}'); event.stopPropagation();"><i class="fa-solid fa-ellipsis-vertical"></i><div class="msg-menu" id="menu-${msgKey}"><button onclick="prepareReply('${msgObj.name}', '${textExcerptForReply}'); event.stopPropagation(); toggleMsgMenu('${msgKey}')"><i class="fa-solid fa-reply"></i> رد</button>${msgObj.type === 'text' ? `<button onclick="copyMsgText('${safeContentToCopy}'); event.stopPropagation(); toggleMsgMenu('${msgKey}')"><i class="fa-solid fa-copy"></i> نسخ</button>` : ''}${showDeleteBtn ? `<button class="delete-btn" onclick="deleteMsg('${msgKey}'); event.stopPropagation(); toggleMsgMenu('${msgKey}')"><i class="fa-solid fa-trash"></i> حذف للجميع</button>` : ''}</div></div>`;
    let reactMenuHtml = `<div class="reaction-menu" id="react-${msgKey}"><span class="reaction-emoji" onclick="addReaction('${msgKey}', '👍'); event.stopPropagation();">👍</span><span class="reaction-emoji" onclick="addReaction('${msgKey}', '❤️'); event.stopPropagation();">❤️</span><span class="reaction-emoji" onclick="addReaction('${msgKey}', '😂'); event.stopPropagation();">😂</span><span class="reaction-emoji" onclick="addReaction('${msgKey}', '😮'); event.stopPropagation();">😮</span><span class="reaction-emoji" onclick="addReaction('${msgKey}', '😢'); event.stopPropagation();">😢</span><span class="reaction-emoji" onclick="addReaction('${msgKey}', '🙏'); event.stopPropagation();">🙏</span></div>`;
    let readStatusHtml = ''; if (isMe && currentChatMode === 'private') readStatusHtml = `<i id="status-${msgKey}" class="${msgObj.readBy ? "fa-solid fa-check-double status-read" : "fa-solid fa-check-double"}" style="transition: color 0.4s ease, text-shadow 0.4s ease; margin-right: 3px;"></i>`;
    const timeStr = msgObj.timestamp ? new Date(msgObj.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `${actionsHtml}${reactMenuHtml}${!isMe ? `<span class="sender-name">${msgObj.name}</span>` : ''}${quoteHtml}<div>${htmlContent}</div><div class="msg-meta">${timeStr} ${readStatusHtml}</div><div class="reactions-display hidden" id="reactions-display-${msgKey}"></div>`;
    chatMessages.appendChild(div); 
    
    setTimeout(() => { 
        const chatBox = document.getElementById('chat-messages');
        chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' }); 
    }, 150);

    if (msgObj.reactions) updateReactionsUI(msgKey, msgObj.reactions);

    let touchStartX = 0, touchStartY = 0, pressTimer, isSwiping = false;
    const startPress = (e) => { 
        if(e.target.closest('a') || e.target.closest('.yt-preview') || e.target.closest('video') || e.target.closest('.media-download-btn') || e.target.closest('.file-box')) return; 
        if(e.touches) { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; isSwiping = false; } 
        pressTimer = setTimeout(() => { toggleReactMenu(msgKey); if (navigator.vibrate) navigator.vibrate(50); }, 500); 
    };
    const cancelPress = () => { clearTimeout(pressTimer); };
    
    div.addEventListener('touchstart', startPress, {passive: true}); 
    
    div.addEventListener('touchend', e => { 
        cancelPress(); 
        if (!isSwiping) return; 
        let diffX = e.changedTouches ? e.changedTouches[0].clientX - touchStartX : 0; 
        if (Math.abs(diffX) > 80) { prepareReply(msgObj.name, textExcerptForReply); } 
        div.style.transform = `translateX(0)`; 
        setTimeout(() => isSwiping = false, 100);
    }); 
    
    div.addEventListener('touchmove', e => { 
        let diffX = e.touches[0].clientX - touchStartX; 
        let diffY = e.touches[0].clientY - touchStartY; 
        if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) cancelPress(); 
        
        if (Math.abs(diffX) > Math.abs(diffY) * 1.5) {
            isSwiping = true;
            if ((isMe && diffX < -30) || (!isMe && diffX > 30)) { 
                div.style.transform = `translateX(${diffX}px)`; 
            }
        }
    }, {passive: true});
    
    div.addEventListener('mousedown', startPress); 
    div.addEventListener('mouseup', cancelPress); 
    div.addEventListener('mouseleave', cancelPress);
}
