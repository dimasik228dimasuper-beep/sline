/**
 * SLine Calls — fixed WebRTC accept/answer path + stable UI
 * Load AFTER main SLine.html inline scripts (or at end of body).
 */
(function (w) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function ensureRemoteAudioEl() {
    let a = $('call-remote-audio');
    if (!a) {
      a = document.createElement('audio');
      a.id = 'call-remote-audio';
      a.autoplay = true;
      a.setAttribute('playsinline', '');
      a.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1';
      document.body.appendChild(a);
    }
    return a;
  }

  function setStatus(text) {
    const st = $('call-status-text');
    if (st) st.textContent = text;
  }

  function keepCallUIVisible() {
    const ov = $('call-overlay');
    if (!ov) return;
    ov.classList.add('show');
    ov.style.display = 'flex';
    ov.style.zIndex = '100000';
    ov.style.opacity = '1';
    ov.style.visibility = 'visible';
    try {
      if (typeof w.showCallUI === 'function') w.showCallUI();
      else if (typeof showCallUI === 'function') showCallUI();
    } catch (e) {}
    try {
      if (typeof w.renderCallActions === 'function') w.renderCallActions();
      else if (typeof renderCallActions === 'function') renderCallActions();
    } catch (e) {}
    // Hangup always visible when not incoming
    try {
      if (w.currentCall && w.currentCall.state !== 'incoming') {
        const hang = $('cc-hangup');
        if (hang) { hang.style.display = 'flex'; hang.style.zIndex = '100001'; }
        const fab = $('cc-hangup-fab');
        if (fab) fab.style.display = 'flex';
        const mute = $('cc-mute');
        if (mute && w.currentCall.state === 'active') mute.style.display = 'flex';
      }
    } catch (e) {}
  }

  function attachRemoteTrackFixed(track) {
    if (!track) return;
    const rv = $('call-remote-video');
    const ra = ensureRemoteAudioEl();

    if (!w.remoteMediaStream) w.remoteMediaStream = new MediaStream();
    w.remoteMediaStream.getTracks().filter(t => t.kind === track.kind).forEach(t => {
      try { w.remoteMediaStream.removeTrack(t); } catch (e) {}
    });
    w.remoteMediaStream.addTrack(track);

    if (track.kind === 'audio') {
      // Dedicated audio element — mobile browsers often mute hidden video tags
      try {
        const audioOnly = new MediaStream(w.remoteMediaStream.getAudioTracks());
        ra.srcObject = audioOnly;
        ra.muted = false;
        ra.volume = 1;
        ra.play().catch(err => console.warn('[call] audio play', err));
      } catch (e) { console.warn(e); }
    }

    if (rv) {
      rv.srcObject = w.remoteMediaStream;
      rv.muted = false; // also keep on video for combined A/V
      rv.volume = 1;
      rv.autoplay = true;
      rv.playsInline = true;
      const hasVideo = w.remoteMediaStream.getVideoTracks().some(t => t.readyState !== 'ended');
      const wantVideo = !!(w.currentCall && w.currentCall.video);
      if (wantVideo || hasVideo) {
        rv.style.display = 'block';
        rv.style.opacity = '1';
        rv.style.pointerEvents = 'none';
        rv.style.width = '100%';
        rv.style.height = '100%';
        rv.style.objectFit = 'cover';
        const av = $('call-avatar-big');
        if (av) av.style.display = 'none';
        const pulse = $('call-pulse');
        if (pulse) pulse.style.display = 'none';
      } else {
        // voice call: video element only as backup audio path, keep avatar
        rv.style.display = 'block';
        rv.style.opacity = '0';
        rv.style.pointerEvents = 'none';
        rv.style.width = '1px';
        rv.style.height = '1px';
        const av = $('call-avatar-big');
        if (av) av.style.display = 'flex';
      }
      rv.play().catch(err => console.warn('[call] remote video play', err));
    }

    setStatus('Соединено');
    if (w.currentCall) w.currentCall.state = 'active';
    keepCallUIVisible();
  }

  // Override attachRemoteTrack
  w.attachRemoteTrack = attachRemoteTrackFixed;
  if (typeof attachRemoteTrack !== 'undefined') {
    try { attachRemoteTrack = attachRemoteTrackFixed; } catch (e) {}
  }

  // Fixed handleAnswer — was not updating UI / clearing timers
  async function handleAnswerFixed(payload) {
    const pc = w.pc || (typeof pc !== 'undefined' ? pc : null);
    // pc is module-level in HTML — access via window if exposed
    const peer = w.pc;
    const conn = peer || (typeof window !== 'undefined' && window._slPc) || null;
    // The HTML uses global `pc` without window — we need to patch the global function in same scope
    // This file runs as separate script so it only sees window.* 
    // We'll patch by reassigning window.handleAnswer and also the global if possible
  }

  // Patch via wrapping after a tick — globals from previous script share window for functions declared as function foo() which become window.foo
  function patch() {
    // function declarations in previous inline script become properties of window
    const origHandleAnswer = w.handleAnswer;
    w.handleAnswer = async function (payload) {
      try {
        if (!w.pc && typeof pc !== 'undefined') w.pc = pc;
      } catch (e) {}
      // Use live global pc from page — re-read each time
      let conn = null;
      try { conn = (typeof pc !== 'undefined' && pc) ? pc : w.pc; } catch (e) { conn = w.pc; }
      if (!conn) {
        console.warn('[call] handleAnswer: no pc');
        return;
      }
      try {
        if (payload && payload.from && w.currentCall && w.currentCall.peerId &&
            String(payload.from) !== String(w.currentCall.peerId)) {
          console.warn('[call] answer from wrong peer, ignore');
          return;
        }
        const sdp = payload.sdp?.type ? payload.sdp : payload.sdp;
        if (!sdp) throw new Error('empty sdp');
        await conn.setRemoteDescription(new RTCSessionDescription(sdp));
        const queued = (typeof _pendingIceCandidates !== 'undefined' && _pendingIceCandidates)
          ? [..._pendingIceCandidates] : (w._pendingIceCandidates || []);
        try { if (typeof _pendingIceCandidates !== 'undefined') _pendingIceCandidates = []; } catch (e) {}
        w._pendingIceCandidates = [];
        for (const c of queued) {
          try { await conn.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
        }
        if (w.currentCall) {
          w.currentCall.state = 'active';
        }
        try {
          if (w._slNoAnswerTimer) { clearTimeout(w._slNoAnswerTimer); w._slNoAnswerTimer = null; }
        } catch (e) {}
        setStatus('Соединение...');
        keepCallUIVisible();
        // Try play any remote streams already present
        try {
          const receivers = conn.getReceivers ? conn.getReceivers() : [];
          receivers.forEach(r => {
            if (r.track) attachRemoteTrackFixed(r.track);
          });
        } catch (e) {}
      } catch (e) {
        console.error('[call] handleAnswer', e);
        try { if (typeof showToast === 'function') showToast('Ошибка соединения'); } catch (e2) {}
      }
    };

    const origHangupHandler = null;
    // Filter hangup by peer — re-bind signal channel is hard; wrap endCall instead
    const origEndCall = w.endCall;
    if (typeof origEndCall === 'function') {
      // leave endCall as is
    }

    // Accept: after accept keep UI and unlock audio
    const origAccept = w.acceptCall;
    w.acceptCall = async function () {
      try {
        document.getElementById('sl-incoming-call')?.remove();
      } catch (e) {}
      try { if (typeof stopRingtone === 'function') stopRingtone(); } catch (e) {}
      if (typeof origAccept === 'function') {
        await origAccept.apply(this, arguments);
      }
      // After accept, force UI visible (fixes black/disappearing screen)
      try {
        if (w.currentCall) {
          w.currentCall.state = 'active';
          w.currentCall._dir = 'in';
        }
        keepCallUIVisible();
        setStatus('Соединение...');
        ensureRemoteAudioEl();
        // Unlock audio with user gesture residual
        try {
          const ra = ensureRemoteAudioEl();
          ra.play().catch(() => {});
        } catch (e) {}
      } catch (e) { console.warn(e); }
    };

    // Safer hangup signal: only end if payload from current peer (patch init if needed)
    // Wrap the broadcast path by monkey-patching endCall to ignore rapid false hangups during answer
    let _ignoreHangupUntil = 0;
    w._slIgnoreHangupBriefly = function (ms) {
      _ignoreHangupUntil = Date.now() + (ms || 1500);
    };
    const _end = w.endCall;
    w.endCall = function () {
      if (Date.now() < _ignoreHangupUntil) {
        console.info('[call] endCall ignored (answer window)');
        return;
      }
      try {
        const ra = $('call-remote-audio');
        if (ra) { ra.srcObject = null; ra.pause(); }
      } catch (e) {}
      if (typeof _end === 'function') return _end.apply(this, arguments);
    };

    // When sending answer, ignore hangups briefly (race with duplicate signals)
    const origSend = w.sendSignal;
    if (typeof origSend === 'function') {
      w.sendSignal = function (toId, event, payload) {
        if (event === 'answer') {
          try { w._slIgnoreHangupBriefly(2000); } catch (e) {}
        }
        return origSend.apply(this, arguments);
      };
    }

    // Expose pc on window for patches
    try {
      const _wire = w.wirePeerConnection;
      if (typeof _wire === 'function') {
        w.wirePeerConnection = function (peerId, withVideo) {
          const conn = _wire.apply(this, arguments);
          w.pc = conn || w.pc;
          try {
            if (conn) {
              const prevOnTrack = conn.ontrack;
              conn.ontrack = function (e) {
                console.log('[call] ontrack fixed', e.track && e.track.kind);
                attachRemoteTrackFixed(e.track);
                if (typeof prevOnTrack === 'function') {
                  try { prevOnTrack.call(conn, e); } catch (err) {}
                }
              };
              conn.onconnectionstatechange = function () {
                console.log('[call] connectionState', conn.connectionState);
                if (conn.connectionState === 'connected') {
                  setStatus('Соединено');
                  if (w.currentCall) w.currentCall.state = 'active';
                  keepCallUIVisible();
                  try {
                    if (w._slNoAnswerTimer) { clearTimeout(w._slNoAnswerTimer); w._slNoAnswerTimer = null; }
                  } catch (e) {}
                } else if (conn.connectionState === 'connecting') {
                  setStatus('Соединение...');
                  keepCallUIVisible();
                } else if (conn.connectionState === 'failed') {
                  setStatus('Ошибка связи');
                  try { if (typeof showToast === 'function') showToast('Не удалось установить соединение'); } catch (e) {}
                  // Do NOT auto endCall — let user hang up; auto-end felt like "screen disappeared"
                } else if (conn.connectionState === 'disconnected') {
                  setStatus('Переподключение...');
                }
              };
            }
          } catch (e) { console.warn(e); }
          return conn;
        };
      }
    } catch (e) { console.warn('[call] wire patch', e); }

    console.info('[SL] calls.js patches applied');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(patch, 0));
  } else {
    setTimeout(patch, 0);
  }
  // Also patch later after auth may redefine things
  w.addEventListener('load', () => setTimeout(patch, 500));
})(window);
