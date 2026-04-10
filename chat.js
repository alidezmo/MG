import { db, ref, push, onValue, set, update, remove, query, limitToLast, onChildAdded, onChildRemoved, onChildChanged, get, orderByKey, endBefore, CLOUDINARY_URL, CLOUDINARY_UPLOAD_PRESET } from './firebase-config.js';
import { state } from './state.js';

const chatMessages = document.getElementById('chat-messages'); 
const msgInput = document.getElementById('msg-input');

function playNotificationSound() { const snd = document.getElementById('notification-sound'); if(snd) { snd.currentTime = 0; snd.play().catch(()=>{}); } }
window.copyMsgText = function(text) { navigator.clipboard.writeText(text).then(() => { window.showInAppToast('النظام', 'تم نسخ النص بنجاح ✔️', 'global', 'system'); }).catch(()=>{}); };

window.handleIncomingNotification = function(msg, roomType, targetId) {
    if (msg.timestamp < state.appStartTime || msg.name === state.myName) return; 
    if (!(state.currentChatMode === roomType && state.currentChatTargetId === targetId)) {
        const badgeId = roomType === 'global' ? 'global' : targetId; state.unreadCounts[badgeId] = (state.unreadCounts[badgeId] || 0) + 1;
        const badgeEl = document.getElementById('badge-' + badgeId); if (badgeEl) { badgeEl.innerText = state.unreadCounts[badgeId]; badgeEl.style.display = 'flex'; }
        playNotificationSound();
        let notifBody = msg.type === 'text' ? msg.content : (msg.type === 'audio' ? '🎤 أرسل رسالة صوتية' : '📁 أرسل ملفاً/صورة');
        if ('setAppBadge' in navigator) navigator.setAppBadge(Object.values(state.unreadCounts).reduce((a, b) => a + b, 0)).catch(()=>{});
        if (document.hidden && Notification.permission === "granted") { const notification = new Notification(roomType === 'global' ? `المجموعة العامة - ${msg.name}` : `رسالة من ${msg.name}`, { body: notifBody, icon: './icon.svg' }); notification.onclick = function() { window.focus(); this.close(); }; } 
        else if (!document.hidden) window.showInAppToast(msg.name, notifBody, roomType, targetId);
    }
}

window.listenForNotifications = function(roomRefPath, roomType, targetId) {
    if (state.trackedRooms.has(roomRefPath)) return; state.trackedRooms.add(roomRefPath);
    onChildAdded(query(ref(db, roomRefPath), limitToLast(50)), snapshot => window.handleIncomingNotification(snapshot.val(), roomType, targetId));
}

// ================== نظام جلب الرسائل القديمة (Infinite Scroll) ==================
async function loadMoreMessages() {
    state.isLoadingMore = true;
    const oldScrollHeight = chatMessages.scrollHeight; // نحفظ الارتفاع القديم

    const loadingEl = document.createElement('div');
    loadingEl.id = 'loading-more-msgs';
    loadingEl.style.textAlign = 'center'; loadingEl.style.padding = '10px';
    loadingEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" style="color:var(--primary-color); font-size:20px;"></i>';
    chatMessages.prepend(loadingEl);

    try {
        const q = query(ref(db, state.currentMessagesRefPath), orderByKey(), endBefore(state.oldestMessageKey), limitToLast(50));
        const snapshot = await get(q);

        if (snapshot.exists()) {
            const messages = [];
            snapshot.forEach(child => { messages.push({ key: child.key, val: child.val() }); });
            
            // إضافة الرسائل للأعلى بترتيب عكسي لتظل مرتبة زمنياً
            messages.reverse().forEach(msg => {
                renderMsg(msg.key, msg.val, msg.val.name === state.myName, true);
            });
        } else {
            state.allMessagesLoaded = true; // لا يوجد رسائل أقدم
        }
    } catch (err) { console.error("Error loading messages:", err); }

    document.getElementById('loading-more-msgs')?.remove();
    
    // معادلة سحرية للحفاظ على مكان الشاشة بعد إضافة الرسائل الجديدة فوق
    const newScrollHeight = chatMessages.scrollHeight;
    chatMessages.scrollTop = newScrollHeight - oldScrollHeight;
    state.isLoadingMore = false;
}

chatMessages.addEventListener('scroll', () => {
    // إذا وصل المستخدم لقمة الشاشة، ولم يتم التحميل مسبقاً، ولم تنتهِ الرسائل
    if (chatMessages.scrollTop === 0 && !state.isLoadingMore && !state.allMessagesLoaded && state.oldestMessageKey) {
        loadMoreMessages();
    }
});
// ==============================================================================

window.switchChat = function(mode, title, targetId = null) {
    state.currentChatMode = mode; state.currentChatTargetId = targetId; window.cancelReply(); window.cancelAttachment();
    
    // تصفير متغيرات التحميل للغرفة الجديدة
    state.oldestMessageKey = null; state.allMessagesLoaded = false; state.isLoadingMore = false;
    
    const badgeId = mode === 'global' ? 'global' : targetId; state.unreadCounts[badgeId] = 0; if (document.getElementById(`badge-${badgeId}`)) document.getElementById(`badge-${badgeId}`).style.display = 'none';
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active-chat'));
    const activeBtn = mode === 'global' ? document.getElementById('chat-btn-global') : document.getElementById(`chat-btn-${targetId}`); if(activeBtn) activeBtn.classList.add('active-chat');
    document.getElementById('chat-title').innerText = title; document.getElementById('header-icon').innerHTML = mode === 'global' ? '<i class="fa-solid fa-earth-americas"></i>' : title.charAt(0).toUpperCase(); document.getElementById('header-icon').style.background = mode === 'global' ? 'var(--primary-color)' : '#10b981';
    if (mode === 'global' && state.myRole !== 'admin') document.getElementById('clear-chat-btn').style.display = 'none'; else document.getElementById('clear-chat-btn').style.display = 'flex';

    state.currentListeners.forEach(unsub => unsub()); state.currentListeners = []; if(state.typingListener) { state.typingListener(); state.typingListener = null; } chatMessages.innerHTML = ''; 
    const roomID = mode === 'global' ? 'global' : (state.myUserId < targetId ? `${state.myUserId}_${targetId}` : `${targetId}_${state.myUserId}`);
    state.currentMessagesRefPath = mode === 'global' ? 'messages_global' : `messages_private/${roomID}`;
    
    // جلب أول 50 رسالة فقط عند الدخول
    const refQuery = query(ref(db, state.currentMessagesRefPath), limitToLast(50));

    state.currentListeners.push(onChildAdded(refQuery, (snapshot) => {
        const msg = snapshot.val(); renderMsg(snapshot.key, msg, msg.name === state.myName, false);
        if (msg.name !== state.myName && msg.timestamp > state.appStartTime) { const receiveSound = document.getElementById('sound-received'); if(receiveSound) { receiveSound.currentTime = 0; receiveSound.play().catch(()=>{}); } }
        if (msg.name !== state.myName && (!msg.readBy || !msg.readBy[state.myUserId])) {
            if (!document.hidden) update(ref(db, `${state.currentMessagesRefPath}/${snapshot.key}`), { [`readBy/${state.myUserId}`]: true }); else state.pendingUnreadMessages.push(`${state.currentMessagesRefPath}/${snapshot.key}`);
        }
    }));
  state.currentListeners.push(onChildChanged(refQuery, (snapshot) => { 
        const msg = snapshot.val(); 
        const statusIcon = document.getElementById('status-' + snapshot.key); 
        if (statusIcon) {
            let isFullyRead = false;
            if (state.currentChatMode === 'private') {
                isFullyRead = msg.readBy ? true : false;
            } else {
                // إذا كان الجروب العام، نتحقق هل عدد القراء يساوي كل الناس؟
                const readCount = msg.readBy ? Object.keys(msg.readBy).length : 0;
                isFullyRead = readCount > 0 && readCount >= (state.totalUsers - 1);
            }
            // إذا قرأها الجميع (صحين أزرق)، وإلا (صح واحدة)
            statusIcon.className = isFullyRead ? "fa-solid fa-check-double status-read" : "fa-solid fa-check";
        }
        updateReactionsUI(snapshot.key, msg.reactions); 
    }));
    state.currentListeners.push(onChildRemoved(refQuery, (snapshot) => { const el = document.getElementById('msg-' + snapshot.key); if(el) { el.style.animation = 'fadeIn 0.3s ease reverse'; setTimeout(() => el.remove(), 250); } }));

    state.typingListener = onValue(ref(db, `typing/${roomID}`), snapshot => {
        let anyoneTyping = false, typingName = ''; snapshot.forEach(child => { if(child.key !== state.myUserId && child.val().isTyping) { anyoneTyping = true; typingName = child.val().name; } });
        document.getElementById('chat-subtitle').innerHTML = anyoneTyping ? `<span class="typing-indicator">${typingName} يكتب...</span>` : 'مشفر بالكامل';
    });
};

document.getElementById('clear-chat-btn').addEventListener('click', () => {
    if (!state.currentMessagesRefPath) return;
    if (state.currentChatMode === 'global' && state.myRole !== 'admin') return; 
    if (confirm("هل أنت متأكد من مسح المحادثة بالكامل للجميع؟")) { remove(ref(db, state.currentMessagesRefPath)).then(() => alert("تم مسح المحادثة بنجاح!")).catch(() => alert("حدث خطأ أثناء المسح.")); }
});

window.addEventListener('focus', () => {
    if (state.pendingUnreadMessages && state.pendingUnreadMessages.length > 0) {
        state.pendingUnreadMessages.forEach(fullPath => { update(ref(db, fullPath), { [`readBy/${state.myUserId}`]: true }); }); state.pendingUnreadMessages = []; 
        if (state.currentChatMode === 'private' && state.currentChatTargetId) { state.unreadCounts[state.currentChatTargetId] = 0; const badgeEl = document.getElementById('badge-' + state.currentChatTargetId); if (badgeEl) badgeEl.style.display = 'none'; }
    }
    if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(()=>{});
});

window.addReaction = function(msgKey, emoji) { update(ref(db, `${state.currentMessagesRefPath}/${msgKey}/reactions`), { [state.myUserId]: emoji }); document.querySelectorAll('.reaction-menu.show').forEach(m => m.classList.remove('show')); };

function updateReactionsUI(msgKey, reactionsObj) {
    const displayEl = document.getElementById('reactions-display-' + msgKey); if (!displayEl) return;
    if (!reactionsObj) { displayEl.classList.add('hidden'); return; }
    const emojiCounts = {}; Object.values(reactionsObj).forEach(emoji => { emojiCounts[emoji] = (emojiCounts[emoji] || 0) + 1; });
    let html = ''; Object.keys(emojiCounts).forEach(emoji => { html += `<span>${emoji}</span>`; });
    if (Object.keys(reactionsObj).length > 1) html += `<span style="font-size:10px; margin-right:3px; opacity:0.8;">${Object.keys(reactionsObj).length}</span>`;
    displayEl.innerHTML = html; displayEl.classList.remove('hidden');
}

window.deleteMsg = function(msgKey) { if(confirm("حذف الرسالة لدى الجميع؟")) remove(ref(db, `${state.currentMessagesRefPath}/${msgKey}`)); };

window.prepareReply = function(msgKey, name, textExcerpt) { 
    state.replyingToMsg = { key: msgKey, name: name, text: textExcerpt }; 
    document.getElementById('reply-preview-box').style.display = 'block'; document.getElementById('reply-preview-name').innerText = name; document.getElementById('reply-preview-text').innerText = textExcerpt; msgInput.focus(); 
};
window.cancelReply = function() { state.replyingToMsg = null; document.getElementById('reply-preview-box').style.display = 'none'; };

msgInput.addEventListener('input', function() {
    this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px'; if(!state.currentMessagesRefPath) return;
    const roomID = state.currentChatMode === 'global' ? 'global' : (state.myUserId < state.currentChatTargetId ? `${state.myUserId}_${state.currentChatTargetId}` : `${state.currentChatTargetId}_${state.myUserId}`);
    set(ref(db, `typing/${roomID}/${state.myUserId}`), { name: state.myName, isTyping: true }); clearTimeout(window.typingTimeout); window.typingTimeout = setTimeout(() => set(ref(db, `typing/${roomID}/${state.myUserId}`), { name: state.myName, isTyping: false }), 1500);
});

function renderTempMsg(msgKey, msgObj) {
    const div = document.createElement('div'); div.id = 'msg-' + msgKey; div.className = `msg-bubble msg-me`; div.style.opacity = '0.7'; let htmlContent = '';
    if (msgObj.type === 'file') {
        const fName = (msgObj.fileName || '').toLowerCase(); const isPdf = fName.endsWith('.pdf'); const isDoc = fName.match(/\.(doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar)$/i); const isFile = isPdf || isDoc;
        const isImg = !isFile && (msgObj.content.startsWith('data:image/') || fName.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i) || msgObj.content.includes('/image/upload/')); const isVid = !isFile && (msgObj.content.startsWith('data:video/') || fName.match(/\.(mp4|webm|ogg|mov)$/i) || msgObj.content.includes('/video/upload/'));
        if (isImg) htmlContent = `<div style="position:relative;"><img src="${msgObj.content}" class="image-preview"><div id="overlay-${msgKey}" class="temp-msg-overlay"><i class="fa-solid fa-circle-notch temp-spinner"></i></div></div>`;
        else if (isVid) htmlContent = `<div style="position:relative;"><video src="${msgObj.content}" style="max-width:100%; border-radius:12px;"></video><div id="overlay-${msgKey}" class="temp-msg-overlay"><i class="fa-solid fa-circle-notch temp-spinner"></i></div></div>`;
        else htmlContent = `<div style="position:relative;" class="file-box"><div style="display:flex; align-items:center; gap:10px;"><i class="fa-solid ${isPdf ? 'fa-file-pdf' : 'fa-file'}" style="font-size:30px; color:${isPdf ? '#ef4444' : 'var(--primary-color)'};"></i> <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; font-weight:bold;">${msgObj.fileName}</div></div><div id="overlay-${msgKey}" class="temp-msg-overlay"><i class="fa-solid fa-circle-notch temp-spinner"></i></div></div>`;
    } else if (msgObj.type === 'audio') htmlContent = `<div style="position:relative;"><div class="custom-audio-player"><button class="play-btn"><i class="fa-solid fa-play"></i></button><div class="audio-progress"></div><div class="audio-time">${msgObj.durationText}</div></div><div id="overlay-${msgKey}" class="temp-msg-overlay"><i class="fa-solid fa-circle-notch temp-spinner"></i></div></div>`;
    let captionHtml = msgObj.caption ? `<div style="margin-top:8px; font-size:14px;">${msgObj.caption}</div>` : ''; div.innerHTML = `<div>${htmlContent}</div>${captionHtml}<div class="msg-meta">جاري الإرسال... <i class="fa-regular fa-clock"></i></div>`;
    chatMessages.appendChild(div); setTimeout(() => { chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' }); }, 100);
}

async function sendRealPushNotification(targetId, title, message) {
    const REST_API_KEY = "os_v2_app_zcnc2bg6inboxbntf5c4i63lba" + "hjebt6rpyesuushnigpfbyqp3vzbcoeyd7blnpj6zjwt2e6vqedjf3wdy226rvvgbkx4natfamufa"; 
    if (!REST_API_KEY) return;
    const data = { app_id: "c89a2d04-de43-42eb-85b3-2f45c47b6b08", headings: { "en": title, "ar": title }, contents: { "en": message, "ar": message } };
    if (targetId === 'global') data.included_segments = ["Subscribed Users"]; else data.include_aliases = { external_id: [targetId] }; 
    try {
        const response = await fetch("https://onesignal.com/api/v1/notifications", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8", "Authorization": "Basic " + REST_API_KEY }, body: JSON.stringify(data) });
        if (!response.ok) console.warn("تم إرسال الرسالة، لكن الإشعار لم يصل بسبب حماية OneSignal أو حظر الإعلانات.");
    } catch (e) { console.warn("تم حظر إرسال الإشعار بواسطة المتصفح."); }
}

window.sendMessage = async function(dataObj) {
    if(!state.currentMessagesRefPath) return; 
    dataObj.name = state.myName; dataObj.timestamp = Date.now(); if(state.replyingToMsg) dataObj.replyTo = state.replyingToMsg;
    const newRef = push(ref(db, state.currentMessagesRefPath)); const msgKey = newRef.key;
    if (dataObj.rawFile) {
        state.uploadingKeys.push(msgKey); renderTempMsg(msgKey, dataObj);
        const formData = new FormData(); formData.append('file', dataObj.rawFile); formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        try {
            const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData }); const uploadData = await response.json();
            if (uploadData.secure_url) { dataObj.content = uploadData.secure_url; delete dataObj.rawFile; await set(newRef, dataObj); state.uploadingKeys = state.uploadingKeys.filter(k => k !== msgKey); const overlay = document.getElementById('overlay-' + msgKey); if(overlay) overlay.remove(); } 
            else throw new Error("Cloudinary Error");
        } catch (err) { state.uploadingKeys = state.uploadingKeys.filter(k => k !== msgKey); const overlay = document.getElementById('overlay-' + msgKey); if(overlay) overlay.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444; font-size:30px;"></i>'; return; }
    } else { await set(newRef, dataObj); }

    const roomID = state.currentChatMode === 'global' ? 'global' : (state.myUserId < state.currentChatTargetId ? `${state.myUserId}_${state.currentChatTargetId}` : `${state.currentChatTargetId}_${state.myUserId}`);
    set(ref(db, `typing/${roomID}/${state.myUserId}`), { name: state.myName, isTyping: false }); window.cancelReply(); 
    sendRealPushNotification(state.currentChatMode === 'global' ? 'global' : state.currentChatTargetId, state.myName, dataObj.type === 'text' ? dataObj.content : (dataObj.type === 'audio' ? '🎤 رسالة صوتية' : '📁 ملف مرفق'));
    msgInput.style.height = 'auto';
}

document.getElementById('send-btn').addEventListener('click', () => { 
    const text = msgInput.value.trim(); 
    if(text || state.pendingAttachment) { 
        if (state.pendingAttachment) window.sendMessage({ type: 'file', fileName: state.pendingAttachment.fileName, content: state.pendingAttachment.content, rawFile: state.pendingAttachment.fileObj, caption: text });
        else window.sendMessage({ type: 'text', content: text }); 
        window.cancelReply(); window.cancelAttachment();
        const sendSound = document.getElementById('sound-sent'); if(sendSound) { sendSound.currentTime = 0; sendSound.play().catch(()=>{}); }
        msgInput.value = ''; msgInput.style.height = 'auto'; msgInput.blur(); setTimeout(() => { chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' }); }, 200);
    }
});
msgInput.addEventListener('keypress', (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('send-btn').click(); } });

function processTextForLinks(text) {
    let safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;"); 
    let ytVideoId = null; const ytMatch = safeText.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch && ytMatch[1]) { ytVideoId = ytMatch[1]; }
    let formattedText = safeText.replace(/(https?:\/\/[^\s]+)/g, url => `<a href="${url}" target="_blank">${url}</a>`).replace(/\n/g, '<br>');
    if (ytVideoId) formattedText += `<div class="yt-preview"><iframe src="https://www.youtube.com/embed/${ytVideoId}" allow="fullscreen" allowfullscreen style="border:none; width:100%; height:100%; position:absolute; top:0; left:0;"></iframe></div>`;
    return formattedText;
}

// أضفنا مُعامل `isPrepend` لتحديد ما إذا كانت الرسالة قديمة يتم إضافتها للأعلى
function renderMsg(msgKey, msgObj, isMe, isPrepend = false) {
    const existingDiv = document.getElementById('msg-' + msgKey); if (existingDiv) existingDiv.remove(); 
    
    // تحديث مفتاح "أقدم رسالة" لتشغيل التمرير اللانهائي
    if (!state.oldestMessageKey || msgKey < state.oldestMessageKey) {
        state.oldestMessageKey = msgKey;
    }

    const div = document.createElement('div'); div.id = 'msg-' + msgKey; div.className = `msg-bubble ${isMe ? 'msg-me' : 'msg-other'}`;
    let htmlContent = '', textExcerptForReply = '', safeContentToCopy = ''; 
    let quoteHtml = ''; if(msgObj.replyTo) quoteHtml = `<div class="quoted-msg" onclick="window.scrollToMsg('${msgObj.replyTo.key}')"><strong>${msgObj.replyTo.name}</strong><div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${msgObj.replyTo.text}</div></div>`;
    let overlayHtml = (state.uploadingKeys && state.uploadingKeys.includes(msgKey)) ? `<div id="overlay-${msgKey}" class="temp-msg-overlay"><i class="fa-solid fa-circle-notch temp-spinner"></i></div>` : '';

    if (msgObj.type === 'text') { htmlContent = processTextForLinks(msgObj.content); textExcerptForReply = msgObj.content; safeContentToCopy = msgObj.content.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n'); } 
    else if (msgObj.type === 'file') { 
        let captionHtml = msgObj.caption ? `<div style="margin-top:8px; font-size:14px;">${processTextForLinks(msgObj.caption)}</div>` : '';
        let viewUrl = msgObj.content; let downloadUrl = msgObj.content;
        if (downloadUrl.includes('cloudinary.com') && downloadUrl.includes('/upload/')) downloadUrl = downloadUrl.replace('/upload/', '/upload/fl_attachment/');
        const fName = (msgObj.fileName || '').toLowerCase(); const isPdf = fName.endsWith('.pdf'); const isDoc = fName.match(/\.(doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar)$/i); const isFile = isPdf || isDoc;
        if ((isPdf || isDoc) && !fName.match(/\.(zip|rar)$/i)) viewUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(msgObj.content)}`;
        const isImg = !isFile && (msgObj.content.startsWith('data:image/') || fName.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i) || msgObj.content.includes('/image/upload/')); const isVid = !isFile && (msgObj.content.startsWith('data:video/') || fName.match(/\.(mp4|webm|ogg|mov)$/i) || msgObj.content.includes('/video/upload/'));

        if (isImg) { htmlContent = `<div style="position:relative;"><img src="${msgObj.content}" class="image-preview" onclick="window.openLightbox(this.src)">${overlayHtml}</div>${captionHtml}<div style="display:flex; justify-content:flex-start; margin-top: 5px;"><a href="${downloadUrl}" download="${msgObj.fileName || 'image.png'}" class="media-download-btn"><i class="fa-solid fa-download"></i> تحميل الصورة</a></div>`; textExcerptForReply = '📷 صورة' + (msgObj.caption ? ` - ${msgObj.caption}` : ''); } 
        else if (isVid) { htmlContent = `<div style="position:relative;"><video src="${msgObj.content}" controls playsinline webkit-playsinline style="max-width: 100%; border-radius: 12px; margin-top: 5px; border: 1px solid var(--border-color); background: #000;"></video>${overlayHtml}</div>${captionHtml}<div style="display:flex; justify-content:flex-start; margin-top: 5px;"><a href="${downloadUrl}" download="${msgObj.fileName || 'video.mp4'}" class="media-download-btn"><i class="fa-solid fa-download"></i> تحميل الفيديو</a></div>`; textExcerptForReply = '🎥 فيديو' + (msgObj.caption ? ` - ${msgObj.caption}` : ''); }
        else { htmlContent = `<div class="file-box"><div style="display:flex; align-items:center; gap:10px; margin-bottom: 10px;"><i class="fa-solid ${isPdf ? 'fa-file-pdf' : 'fa-file'}" style="font-size:30px; color: ${isPdf ? '#ef4444' : 'var(--primary-color)'};"></i><div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; font-weight:bold; font-size:14px; line-height: 1.4;">${msgObj.fileName || 'ملف مرفق'}</div></div>${overlayHtml}<div style="display:flex; gap: 8px;"><a href="${viewUrl}" target="_blank" class="media-download-btn" style="flex:1; justify-content:center; background:var(--primary-color) !important; color:white !important; border:none;"><i class="fa-solid fa-eye"></i> عرض</a><a href="${downloadUrl}" download="${msgObj.fileName}" class="media-download-btn" style="flex:1; justify-content:center;"><i class="fa-solid fa-download"></i> تحميل</a></div></div>${captionHtml}`; textExcerptForReply = '📁 ملف'; } 
    } 
    else if (msgObj.type === 'audio') { const audioId = 'audio-' + msgKey; const durationText = msgObj.durationText || '00:00'; htmlContent = `<div style="position:relative;"><div class="custom-audio-player"><button class="play-btn" onclick="window.toggleAudio('${audioId}')"><i class="fa-solid fa-play" id="icon-${audioId}"></i></button><div class="audio-progress"><div class="progress-bar" id="progress-${audioId}"></div></div><div class="audio-time" id="time-${audioId}" data-duration="${durationText}">${durationText}</div><audio id="${audioId}" src="${msgObj.content}" style="display:none;" ontimeupdate="window.updateAudioProgress('${audioId}')" onended="window.audioEnded('${audioId}')"></audio></div>${overlayHtml}</div>`; textExcerptForReply = '🎤 صوت'; }

    const showDeleteBtn = isMe || state.myRole === 'admin';
   let actionsHtml = `<div class="msg-options" onclick="window.toggleMsgMenu('${msgKey}'); event.stopPropagation();"><i class="fa-solid fa-ellipsis-vertical"></i><div class="msg-menu" id="menu-${msgKey}"><button onclick="window.prepareReply('${msgKey}', '${msgObj.name}', '${textExcerptForReply}'); event.stopPropagation(); window.toggleMsgMenu('${msgKey}')"><i class="fa-solid fa-reply"></i> رد</button>${msgObj.type === 'text' ? `<button onclick="window.copyMsgText('${safeContentToCopy}'); event.stopPropagation(); window.toggleMsgMenu('${msgKey}')"><i class="fa-solid fa-copy"></i> نسخ</button>` : ''}${isMe ? `<button onclick="window.showMsgInfo('${msgKey}'); event.stopPropagation(); window.toggleMsgMenu('${msgKey}')"><i class="fa-solid fa-circle-info"></i> تفاصيل الرسالة</button>` : ''}${showDeleteBtn ? `<button class="delete-btn" onclick="window.deleteMsg('${msgKey}'); event.stopPropagation(); window.toggleMsgMenu('${msgKey}')"><i class="fa-solid fa-trash"></i> حذف للجميع</button>` : ''}</div></div>`;
    let reactMenuHtml = `<div class="reaction-menu" id="react-${msgKey}"><span class="reaction-emoji" onclick="window.addReaction('${msgKey}', '👍'); event.stopPropagation();">👍</span><span class="reaction-emoji" onclick="window.addReaction('${msgKey}', '❤️'); event.stopPropagation();">❤️</span><span class="reaction-emoji" onclick="window.addReaction('${msgKey}', '😂'); event.stopPropagation();">😂</span><span class="reaction-emoji" onclick="window.addReaction('${msgKey}', '😮'); event.stopPropagation();">😮</span><span class="reaction-emoji" onclick="window.addReaction('${msgKey}', '😢'); event.stopPropagation();">😢</span><span class="reaction-emoji" onclick="window.addReaction('${msgKey}', '🙏'); event.stopPropagation();">🙏</span></div>`;
    let readStatusHtml = ''; 
    if (isMe) {
        let isFullyRead = false;
        if (state.currentChatMode === 'private') {
            isFullyRead = msgObj.readBy ? true : false;
        } else {
            const readCount = msgObj.readBy ? Object.keys(msgObj.readBy).length : 0;
            isFullyRead = readCount > 0 && readCount >= (state.totalUsers - 1);
        }
        readStatusHtml = `<i id="status-${msgKey}" class="${isFullyRead ? "fa-solid fa-check-double status-read" : "fa-solid fa-check"}" style="transition: color 0.4s ease, text-shadow 0.4s ease; margin-right: 3px;"></i>`;
    }
    const timeStr = msgObj.timestamp ? new Date(msgObj.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `${actionsHtml}${reactMenuHtml}${!isMe ? `<span class="sender-name">${msgObj.name}</span>` : ''}${quoteHtml}<div>${htmlContent}</div><div class="msg-meta">${timeStr} ${readStatusHtml}</div><div class="reactions-display hidden" id="reactions-display-${msgKey}"></div>`;
    
    // إذا كانت رسالة قديمة يتم إدراجها للأعلى
    if (isPrepend) {
        chatMessages.prepend(div);
    } else {
        chatMessages.appendChild(div); 
        setTimeout(() => { chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' }); }, 150);
    }

    if (msgObj.reactions) updateReactionsUI(msgKey, msgObj.reactions);

    let touchStartX = 0, touchStartY = 0, pressTimer, isSwiping = false;
    const startPress = (e) => { if(e.target.closest('a') || e.target.closest('.yt-preview') || e.target.closest('video') || e.target.closest('.media-download-btn') || e.target.closest('.file-box')) return; if(e.touches) { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; isSwiping = false; } pressTimer = setTimeout(() => { window.toggleReactMenu(msgKey); if (navigator.vibrate) navigator.vibrate(50); }, 500); };
    const cancelPress = () => { clearTimeout(pressTimer); };
    div.addEventListener('touchstart', startPress, {passive: true}); 
    div.addEventListener('touchend', e => { cancelPress(); if (!isSwiping) return; let diffX = e.changedTouches ? e.changedTouches[0].clientX - touchStartX : 0; if (Math.abs(diffX) > 80) { window.prepareReply(msgKey, msgObj.name, textExcerptForReply); } div.style.transform = `translateX(0)`; setTimeout(() => isSwiping = false, 100); }); 
    div.addEventListener('touchmove', e => { let diffX = e.touches[0].clientX - touchStartX; let diffY = e.touches[0].clientY - touchStartY; if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) cancelPress(); if (Math.abs(diffX) > Math.abs(diffY) * 1.5) { isSwiping = true; if ((isMe && diffX < -30) || (!isMe && diffX > 30)) { div.style.transform = `translateX(${diffX}px)`; } } }, {passive: true});
    div.addEventListener('mousedown', startPress); div.addEventListener('mouseup', cancelPress); div.addEventListener('mouseleave', cancelPress);
}

// ================= تفاصيل الرسالة (من قرأ وتفاعل) =================
window.showMsgInfo = async function(msgKey) {
    const modal = document.getElementById('msg-info-modal');
    const content = document.getElementById('msg-info-content');
    content.innerHTML = '<div style="text-align:center; padding: 20px;"><i class="fa-solid fa-circle-notch fa-spin" style="color:var(--primary-color); font-size:24px;"></i></div>';
    modal.style.display = 'flex';

    try {
        const msgSnap = await get(ref(db, `${state.currentMessagesRefPath}/${msgKey}`));
        const msg = msgSnap.val();
        if(!msg) { content.innerHTML = 'الرسالة غير موجودة.'; return; }

        const usersSnap = await get(ref(db, 'users'));
        const users = usersSnap.val() || {};
        let html = '';

        // قسم التفاعلات
        if (msg.reactions) {
            html += '<div style="font-weight:bold; margin-bottom:10px; color:var(--primary-color);">تفاعل معها:</div>';
            for (let uid in msg.reactions) {
                let uName = users[uid] ? users[uid].name : 'مستخدم';
                html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border-color); background:var(--input-bg); border-radius:8px; margin-bottom:5px;"><span>${uName}</span> <span style="font-size:18px;">${msg.reactions[uid]}</span></div>`;
            }
        }

        // قسم القراءة
        html += '<div style="font-weight:bold; margin-top:15px; margin-bottom:10px; color:var(--primary-color);">قرأها:</div>';
        if (msg.readBy) {
            for (let uid in msg.readBy) {
                let uName = users[uid] ? users[uid].name : 'مستخدم';
                html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border-color); background:var(--input-bg); border-radius:8px; margin-bottom:5px;"><span>${uName}</span> <i class="fa-solid fa-check-double status-read"></i></div>`;
            }
        } else {
            html += '<div style="padding:10px; opacity:0.7; font-size:13px; text-align:center;">لم يقرأها أحد بعد.</div>';
        }

        content.innerHTML = html;
    } catch(e) {
        content.innerHTML = '<div style="color:#ef4444; text-align:center;">حدث خطأ أثناء الجلب.</div>';
    }
};
