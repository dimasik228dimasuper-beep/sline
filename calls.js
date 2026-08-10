/**
 * SLine calls.js — keep CALLER UI alive, real audio, no false hangups
 */
(function (w) {
  'use strict';
  function $(id) { return document.getElementById(id); }

  function ensureRemoteAudio() {
    let a = $('call-remote-audio');
    if (!a) {
      a = document.createElement('audio');
      a.id = 'call-remote-audio';
      a.autoplay = true;
      a.setAttribute('playsinline', '');
      a.style.cssText = 'position:fixed;width:2px;height:2px;opacity:0.01;left:0;top:0;z-index:1';
      document.body.appendChild(a);
    }
    return a;
  }

  function forceCallUI() {
    const ov = $('call-overlay');
    if (!ov) return;
    ov.classList.add('show');
    ov.style.display = 'flex';
    ov.style.zIndex = '100000';
    ov.style.opacity = '1';
    ov.style.visibility = 'visible';
    ov.style.pointerEvents = 'auto';
    const hang = $('cc-hangup');
    if (hang && w.currentCall && w.currentCall.state !== 'incoming') {
      hang.style.display = 'flex';
      hang.style.zIndex = '100001';
    }
    const st = $('call-status-text');
    if (st && w.currentCall && w.currentCall.state === 'active' && !st.textContent) {
      st.textContent = 'Соединение...';
    }
  }

  function attachRemote(track) {
    if (!track) return;
    if (!w.remoteMediaStream) w.remoteMediaStream = new MediaStream();
    w.remoteMediaStream.getTracks().filter(t => t.kind === track.kind).forEach(t => {
      try { w.remoteMediaStream.removeTrack(t); } catch (e) {}
    });
    w.remoteMediaStream.addTrack(track);

    if (track.kind === 'audio') {
      const ra = ensureRemoteAudio();
      ra.srcObject = new MediaStream(w.remoteMediaStream.getAudioTracks());
      ra.muted = false;
      ra.volume = 1;
      const play = () => ra.play().catch(e => console.warn('[call] audio', e));
      play();
      setTimeout(play, 200);
      setTimeout(play, 800);
    }

    const rv = $('call-remote-video');
    if (rv) {
      rv.srcObject = w.remoteMediaStream;
      rv.muted = false;
      rv.volume = 1;
      const hasVideo = w.remoteMediaStream.getVideoTracks().some(t => t.readyState !== 'ended');
      if ((w.currentCall && w.currentCall.video) || hasVideo) {
        rv.style.cssText = 'display:block;opacity:1;position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1';
        const av = $('call-avatar-big'); if (av) av.style.display = 'none';
      } else {
        rv.style.cssText = 'display:block;opacity:0;width:1px;height:1px;position:absolute';
      }
      rv.play().catch(() => {});
    }

    const st = $('call-status-text');
    if (st) st.textContent = 'Соединено';
    if (w.currentCall) w.currentCall.state = 'active';
    forceCallUI();
  }

  function patch() {
    // Strong endCall guard
    const prevEnd = w.endCall;
    if (typeof prevEnd === 'function' && !w._slEndPatchedV2) {
      w._slEndPatchedV2 = 1;
      w.endCall = function () {
        if (!w._slUserHangup && w._slCallProtectUntil && Date.now() < w._slCallProtectUntil) {
          console.warn('[calls.js] endCall blocked');
          forceCallUI();
          return;
        }
        w._slUserHangup = false;
        try {
          const ra = $('call-remote-audio');
          if (ra) { ra.srcObject = null; ra.pause(); }
        } catch (e) {}
        return prevEnd.apply(this, arguments);
      };
    }

    const prevHang = w.slHangup;
    w.slHangup = function () {
      w._slUserHangup = true;
      w._slCallProtectUntil = 0;
      if (typeof prevHang === 'function') return prevHang.apply(this, arguments);
    };

    // handleAnswer reinforce
    const prevAns = w.handleAnswer;
    w.handleAnswer = async function (payload) {
      w._slCallProtectUntil = Date.now() + 8000;
      forceCallUI();
      try {
        if (typeof prevAns === 'function') await prevAns.apply(this, arguments);
      } catch (e) {
        console.error('[calls.js] answer', e);
      }
      forceCallUI();
      try {
        const conn = w.pc || (typeof pc !== 'undefined' ? pc : null);
        if (conn && conn.getReceivers) {
          conn.getReceivers().forEach(r => { if (r.track) attachRemote(r.track); });
        }
      } catch (e) {}
    };

    // wirePeerConnection reinforce ontrack
    const prevWire = w.wirePeerConnection;
    if (typeof prevWire === 'function' && !w._slWirePatchedV2) {
      w._slWirePatchedV2 = 1;
      w.wirePeerConnection = function () {
        const conn = prevWire.apply(this, arguments);
        w.pc = conn || w.pc;
        if (conn) {
          conn.addEventListener('track', function (e) {
            console.log('[calls.js] track', e.track && e.track.kind);
            attachRemote(e.track);
          });
          conn.addEventListener('connectionstatechange', function () {
            if (conn.connectionState === 'connected') {
              w._slCallProtectUntil = Date.now() + 2000;
              const st = $('call-status-text');
              if (st) st.textContent = 'Соединено';
              if (w.currentCall) w.currentCall.state = 'active';
              forceCallUI();
            } else if (conn.connectionState === 'connecting') {
              forceCallUI();
            }
            // never auto-end on failed
          });
        }
        return conn;
      };
    }

    w.attachRemoteTrack = attachRemote;
    console.info('[SL] calls.js v2 active');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(patch, 0); });
  } else {
    setTimeout(patch, 0);
  }
  w.addEventListener('load', function () { setTimeout(patch, 300); });
})(window);
