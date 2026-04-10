import { state } from './state.js';

const msgInput = document.getElementById('msg-input');
window.cancelAttachment = function() { state.pendingAttachment = null; document.getElementById('file-preview-box').style.display = 'none'; };

function showAttachmentPreview(file, dataUrl) {
    state.pendingAttachment = { fileObj: file, fileName: file.name, content: dataUrl, type: 'file', isImage: dataUrl.startsWith('data:image/'), isVideo: dataUrl.startsWith('data:video/') };
    document.getElementById('file-preview-box').style.display = 'block'; document.getElementById('attachment-name').innerText = file.name;
    const thumb = document.getElementById('attachment-thumb'), icon = document.getElementById('attachment-icon');
    if (state.pendingAttachment.isImage || state.pendingAttachment.isVideo) { thumb.src = state.pendingAttachment.isVideo ? 'https://cdn-icons-png.flaticon.com/512/4404/4404094.png' : dataUrl; thumb.style.display = 'block'; icon.style.display = 'none'; } 
    else { thumb.style.display = 'none'; icon.style.display = 'block'; }
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
        const file = event.data.file; if (file.size > 50 * 1024 * 1024) return alert("الحد الأقصى 50 ميجابايت."); 
        const reader = new FileReader(); reader.onload = e => { showAttachmentPreview(file, e.target.result); }; reader.readAsDataURL(file);
    }
});

let mediaRecorder, audioChunks = [], recordTimer, recordingSeconds = 0, lastRecordedTimeString = "00:00", activeMediaStream = null; 
const normalUI = document.getElementById('normal-input-ui'), recordingUI = document.getElementById('recording-ui'), recordTimerEl = document.getElementById('record-timer');
function releaseMicrophone() { if (activeMediaStream) { activeMediaStream.getTracks().forEach(track => track.stop()); activeMediaStream = null; } }
function hideRecordingUI() { clearInterval(recordTimer); recordingUI.style.display = 'none'; normalUI.style.display = 'flex'; document.getElementById('send-btn').style.display = 'flex'; }

document.getElementById('mic-btn').addEventListener('click', async () => {
    try { activeMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true }); mediaRecorder = new MediaRecorder(activeMediaStream); audioChunks = []; mediaRecorder.ondataavailable = e => { if(e.data.size > 0) audioChunks.push(e.data); }; normalUI.style.display = 'none'; document.getElementById('send-btn').style.display = 'none'; recordingUI.style.display = 'flex'; recordingSeconds = 0; lastRecordedTimeString = "00:00"; recordTimerEl.innerText = "00:00"; recordTimer = setInterval(() => { recordingSeconds++; lastRecordedTimeString = `${String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:${String(Math.floor(recordingSeconds % 60)).padStart(2, '0')}`; recordTimerEl.innerText = lastRecordedTimeString; }, 1000); mediaRecorder.start(); } catch(err) { alert('الرجاء السماح بصلاحية الميكروفون!'); }
});
document.getElementById('cancel-record-btn').addEventListener('click', () => { if(mediaRecorder && mediaRecorder.state !== "inactive") { mediaRecorder.onstop = null; mediaRecorder.stop(); } hideRecordingUI(); releaseMicrophone(); });
document.getElementById('send-record-btn').addEventListener('click', () => { 
    if(mediaRecorder && mediaRecorder.state !== "inactive") { mediaRecorder.onstop = () => { const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' }); const reader = new FileReader(); reader.onloadend = () => { if(window.sendMessage) window.sendMessage({ type: 'audio', content: reader.result, rawFile: audioBlob, durationText: lastRecordedTimeString }); releaseMicrophone(); }; reader.readAsDataURL(audioBlob); }; mediaRecorder.stop(); } 
    hideRecordingUI(); 
});
