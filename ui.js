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

window.toggleSidebar = function() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('sidebar-overlay').classList.toggle('active'); }

window.showInAppToast = function(name, text, roomType, targetId) {
    const container = document.getElementById('toast-container'); if(!container) return;
    const toast = document.createElement('div'); toast.className = 'toast-bubble';
    const firstChar = name.charAt(0).toUpperCase(); const avatarBg = roomType === 'global' ? 'var(--primary-color)' : '#10b981';
    toast.innerHTML = `<div class="private-avatar" style="width:38px; height:38px; font-size:16px; background:${avatarBg}; flex-shrink:0;">${firstChar}</div><div style="flex:1; overflow:hidden;"><strong style="display:block; font-size:13px; color:var(--primary-color);">${roomType === 'global' ? 'المجموعة العامة - ' + name : name}</strong><span style="font-size:12px; opacity:0.8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${text}</span></div>`;
    toast.onclick = () => { if (targetId !== 'system' && window.switchChat) window.switchChat(roomType, roomType === 'global' ? 'المجموعة العامة' : name, targetId); toast.style.animation = 'fadeOutUp 0.3s forwards'; setTimeout(() => toast.remove(), 300); };
    container.appendChild(toast); setTimeout(() => { if(toast.parentElement) { toast.style.animation = 'fadeOutUp 0.3s forwards'; setTimeout(() => toast.remove(), 300); } }, 4000);
}

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

window.scrollToMsg = function(key) {
    const el = document.getElementById('msg-' + key);
    if(el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('highlight-msg'); setTimeout(() => el.classList.remove('highlight-msg'), 1500); 
    } else { window.showInAppToast('النظام', 'الرسالة الأصلية غير موجودة أو قديمة جداً', 'global', 'system'); }
};

window.toggleAudio = function(id) { const audio = document.getElementById(id), icon = document.getElementById('icon-' + id); if (audio.paused) { document.querySelectorAll('audio').forEach(a => { if (a.id !== id && a.id !== 'notification-sound' && !a.paused) { a.pause(); document.getElementById('icon-' + a.id).className = 'fa-solid fa-play'; } }); audio.play(); icon.className = 'fa-solid fa-pause'; } else { audio.pause(); icon.className = 'fa-solid fa-play'; } };
window.updateAudioProgress = function(id) { const audio = document.getElementById(id), progress = document.getElementById('progress-' + id), timeEl = document.getElementById('time-' + id); if(audio.duration) { progress.style.width = ((audio.currentTime / audio.duration) * 100) + '%'; timeEl.innerText = `${String(Math.floor(audio.currentTime / 60)).padStart(2, '0')}:${String(Math.floor(audio.currentTime % 60)).padStart(2, '0')}`; } };
window.audioEnded = function(id) { document.getElementById('icon-' + id).className = 'fa-solid fa-play'; document.getElementById('progress-' + id).style.width = '0%'; document.getElementById('time-' + id).innerText = document.getElementById('time-' + id).getAttribute('data-duration'); };

const emojiBtn = document.getElementById('emoji-btn'); const emojiPickerContainer = document.getElementById('emoji-picker-container'); const msgInput = document.getElementById('msg-input');
if (emojiBtn && emojiPickerContainer) {
    emojiBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); emojiPickerContainer.style.display = emojiPickerContainer.style.display === 'none' ? 'block' : 'none'; });
    document.addEventListener('emoji-click', event => { if(msgInput) { msgInput.value += event.detail.unicode; msgInput.style.height = 'auto'; msgInput.style.height = (msgInput.scrollHeight) + 'px'; msgInput.focus(); } });
    document.addEventListener('click', (e) => { if (!e.target.closest('#emoji-picker-container') && !e.target.closest('#emoji-btn')) { emojiPickerContainer.style.display = 'none'; } });
}
