export const state = {
    myName: localStorage.getItem('chat_username') || '',
    myUserId: localStorage.getItem('chat_userid') || '',
    myRole: localStorage.getItem('chat_role') || 'user',
    currentChatMode: 'global',
    currentChatTargetId: null,
    currentMessagesRefPath: '',
    currentListeners: [],
    typingListener: null,
    replyingToMsg: null,
    pendingUnreadMessages: [],
    uploadingKeys: [],
    pendingAttachment: null,
    appStartTime: Date.now(),
    unreadCounts: { global: 0 },
    trackedRooms: new Set(),
    
    // --- متغيرات التمرير اللانهائي (الجديدة) ---
    oldestMessageKey: null, // مفتاح أقدم رسالة تم تحميلها
    isLoadingMore: false,   // لمنع تكرار التحميل إذا كان يحمل بالفعل
    allMessagesLoaded: false

    totalUsers: 0
    
};
