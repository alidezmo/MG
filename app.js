import { db, ref, onValue, update, onDisconnect } from './firebase-config.js';
import { state } from './state.js';
import './ui.js';
import './auth.js';
import './chat.js';
import './media.js';

// ================= تسجيل الـ Service Worker =================
if ('serviceWorker' in navigator) { 
    navigator.serviceWorker.register('sw.js') 
    .then(reg => {
        console.log("Service Worker Registered!");
        navigator.serviceWorker.ready.then((registration) => {
            if (registration.active) registration.active.postMessage({ type: 'CHECK_FOR_SHARED_FILE' });
        });
    })
    .catch((err) => console.log("Service Worker Failed", err)); 
}
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    document.getElementById('install-app-btn').style.display = 'block'; 
});
document.getElementById('install-app-btn').addEventListener('click', async () => {
    if (deferredPrompt) { deferredPrompt.prompt(); const { outcome } = await deferredPrompt.userChoice; if (outcome === 'accepted') { document.getElementById('install-app-btn').style.display = 'none'; } deferredPrompt = null; }
});

// ================= دالة تشغيل التطبيق الرئيسية =================
window.startApp = function() {
    document.getElementById('login-screen').style.display = 'none'; 
    document.getElementById('app-container').style.display = 'flex';
    document.getElementById('my-name-display').innerText = state.myName; 
    document.getElementById('my-avatar').innerText = state.myName.charAt(0).toUpperCase();
    
    if (state.myRole === 'admin') { document.getElementById('admin-panel-btn').style.display = 'block'; }
    
    registerInFirebase(); 
    window.listenForNotifications('messages_global', 'global', 'global'); 
    window.switchChat('global', 'المجموعة العامة');

window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalDeferred.push(async function(OneSignal) {
        
        await OneSignal.init({ 
            appId: "c89a2d04-de43-42eb-85b3-2f45c47b6b08", 
            safari_web_id: "web.onesignal.auto.1afe2633-50cf-455e-8f3e-a50d8cbe1d12", 
            serviceWorkerPath: "MG/sw.js",
            serviceWorkerParam: { scope: "/MG/" }
        });
        
        OneSignal.login(state.myUserId);
        
        // 👇 الحل هنا: استخدام الأداة الأصلية للمتصفح (Notification.permission)
        if ('Notification' in window && Notification.permission === "default") {
            document.getElementById('notification-prompt-modal').style.display = 'flex';
        }
    });
}

function timeAgo(timestamp) {
    if (!timestamp) return 'غير متصل';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'منذ لحظات'; const minutes = Math.floor(seconds / 60); if (minutes < 60) return `آخر ظهور منذ ${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60); if (hours < 24) return `آخر ظهور منذ ${hours} ساعة`; return `آخر ظهور منذ ${Math.floor(hours / 24)} يوم`;
}

function registerInFirebase() {
    const myUserRef = ref(db, 'users/' + state.myUserId); const connectedRef = ref(db, '.info/connected');
    onValue(connectedRef, snap => { if (snap.val() === true) { update(myUserRef, { name: state.myName, userId: state.myUserId, online: true, lastSeen: Date.now() }); onDisconnect(myUserRef).update({ online: false, lastSeen: Date.now() }); } });
    onValue(ref(db, 'users'), snapshot => {
        const allUsers = snapshot.val() || {}; 
        
        // 👇 هذا السطر الجديد ليحسب عدد كل مستخدمي التطبيق
        state.totalUsers = Object.keys(allUsers).length; 
        
        const usersListEl = document.getElementById('online-users-list'); usersListEl.innerHTML = ''; 
        const usersArray = Object.values(allUsers).filter(u => u.userId !== state.myUserId);
        usersArray.sort((a, b) => (b.online === a.online) ? 0 : b.online ? 1 : -1);
        usersArray.forEach(u => {
            const roomID = state.myUserId < u.userId ? `${state.myUserId}_${u.userId}` : `${u.userId}_${state.myUserId}`; window.listenForNotifications(`messages_private/${roomID}`, 'private', u.userId);
            const firstChar = u.name.charAt(0).toUpperCase(); const isActiveChat = state.currentChatTargetId === u.userId ? 'active-chat' : '';
            const statusClass = u.online ? 'status-online' : 'status-offline'; const statusText = u.online ? 'متصل الآن' : timeAgo(u.lastSeen); const avatarClass = u.online ? '' : 'avatar-offline';
            const div = document.createElement('div'); div.className = `user-item ${isActiveChat}`; div.id = `chat-btn-${u.userId}`;
            div.innerHTML = `<div class="private-avatar ${avatarClass}" style="background:${u.online ? '#10b981' : '#6b7280'};">${firstChar}</div><div style="flex:1;"><strong style="display:block; color:var(--text-color); font-size:15px;">${u.name}</strong><small class="${statusClass}">${statusText}</small></div><div class="unread-badge" id="badge-${u.userId}">0</div>`;
            div.onclick = () => { window.switchChat('private', u.name, u.userId); if(window.innerWidth <= 768) window.toggleSidebar(); };
            usersListEl.appendChild(div);
            if(state.unreadCounts[u.userId] > 0) { document.getElementById('badge-' + u.userId).innerText = state.unreadCounts[u.userId]; document.getElementById('badge-' + u.userId).style.display = 'flex'; }
        });
    });
}


// ================= أزرار التحكم في نافذة الإشعارات =================
document.getElementById('allow-notif-btn').addEventListener('click', () => {
    document.getElementById('notification-prompt-modal').style.display = 'none';
    window.OneSignalDeferred.push(async function(OneSignal) {
        await OneSignal.Notifications.requestPermission();
        if (OneSignal.Notifications.permission === "granted") {
            OneSignal.login(state.myUserId); 
            setTimeout(() => { window.showInAppToast('النظام', 'تم تفعيل الإشعارات بنجاح! 🔔', 'global', 'system'); }, 1000);
        }
    });
});

document.getElementById('deny-notif-btn').addEventListener('click', () => { 
    document.getElementById('notification-prompt-modal').style.display = 'none'; 
});
