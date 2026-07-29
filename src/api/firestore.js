import {
  collection, doc, setDoc, getDoc, getDocs, deleteDoc,
  runTransaction, serverTimestamp, increment,
  addDoc, query, orderBy, limit, onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';

// ─── Firestore paths ───────────────────────────────────────────────
// users/{uid}/history/{animeId}      ← watch history
// users/{uid}/list/{animeId}         ← watchlist
// users/{uid}/settings/prefs         ← app/player settings
// anime/{animeId}                    ← aggregate like/dislike counts
// anime/{animeId}/reactions/{uid}    ← per-user reaction record

// ─── HISTORY ─────────────────────────────────────────────────────────────────

/**
 * Save / update a history entry for the current user.
 * Uses animeId as the document ID so each anime only has one entry.
 */
export async function saveHistoryToCloud(uid, { animeId, animeTitle, coverImage, episodeIndex, episodeTitle, totalEpisodes, progress = 0, duration = 0 }) {
  if (!uid) return;
  try {
    const ref = doc(db, 'users', uid, 'history', String(animeId));
    await setDoc(ref, {
      animeId: String(animeId),
      animeTitle,
      coverImage,
      episodeIndex,
      episodeTitle: episodeTitle || '',
      totalEpisodes: totalEpisodes || 0,
      progress,
      duration,
      savedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.log('[Firestore] saveHistoryToCloud error:', e?.message);
  }
}

/**
 * Update only progress + duration for an existing history entry.
 */
export async function updateProgressInCloud(uid, animeId, episodeIndex, progress, duration) {
  if (!uid) return;
  try {
    const ref = doc(db, 'users', uid, 'history', String(animeId));
    await setDoc(ref, {
      progress,
      duration,
      episodeIndex,
      savedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.log('[Firestore] updateProgressInCloud error:', e?.message);
  }
}

/**
 * Fetch all history entries for the user, sorted by savedAt desc.
 */
export async function getHistoryFromCloud(uid) {
  if (!uid) return [];
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'history'));
    const items = [];
    snap.forEach(d => items.push(d.data()));
    // Sort newest first (savedAt may be a Firestore timestamp object)
    items.sort((a, b) => {
      const aTime = a.savedAt?.seconds ?? 0;
      const bTime = b.savedAt?.seconds ?? 0;
      return bTime - aTime;
    });
    return items;
  } catch (e) {
    console.log('[Firestore] getHistoryFromCloud error:', e?.message);
    return [];
  }
}

/**
 * Delete a single history entry.
 */
export async function deleteHistoryItemFromCloud(uid, animeId) {
  if (!uid) return;
  try {
    await deleteDoc(doc(db, 'users', uid, 'history', String(animeId)));
  } catch (e) {
    console.log('[Firestore] deleteHistoryItemFromCloud error:', e?.message);
  }
}

/**
 * Clear all history entries for the user.
 */
export async function clearHistoryFromCloud(uid) {
  if (!uid) return;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'history'));
    const deletes = [];
    snap.forEach(d => deletes.push(deleteDoc(d.ref)));
    await Promise.all(deletes);
  } catch (e) {
    console.log('[Firestore] clearHistoryFromCloud error:', e?.message);
  }
}

// ─── WATCHLIST ────────────────────────────────────────────────────────────────

export async function saveListToCloud(uid, { animeId, animeTitle, coverImage, status, format, year, score }) {
  if (!uid) return;
  try {
    const ref = doc(db, 'users', uid, 'list', String(animeId));
    await setDoc(ref, {
      animeId: String(animeId),
      animeTitle,
      coverImage,
      status: status || 'Planning',
      format: format || 'TV',
      year: year || null,
      score: score || null,
      savedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.log('[Firestore] saveListToCloud error:', e?.message);
  }
}

export async function getListFromCloud(uid) {
  if (!uid) return [];
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'list'));
    const items = [];
    snap.forEach(d => items.push(d.data()));
    items.sort((a, b) => (b.savedAt?.seconds ?? 0) - (a.savedAt?.seconds ?? 0));
    return items;
  } catch (e) {
    console.log('[Firestore] getListFromCloud error:', e?.message);
    return [];
  }
}

export async function removeFromListCloud(uid, animeId) {
  if (!uid) return;
  try {
    await deleteDoc(doc(db, 'users', uid, 'list', String(animeId)));
  } catch (e) {
    console.log('[Firestore] removeFromListCloud error:', e?.message);
  }
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

/**
 * Save all player / app prefs to Firestore for the user.
 */
export async function saveSettingsToCloud(uid, prefs) {
  if (!uid || !prefs) return;
  try {
    const ref = doc(db, 'users', uid, 'settings', 'prefs');
    await setDoc(ref, { ...prefs, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    console.log('[Firestore] saveSettingsToCloud error:', e?.message);
  }
}

/**
 * Load prefs from Firestore for the user.
 * Returns null if no settings doc exists yet.
 */
export async function getSettingsFromCloud(uid) {
  if (!uid) return null;
  try {
    const ref  = doc(db, 'users', uid, 'settings', 'prefs');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const { updatedAt, ...prefs } = snap.data();
      return prefs;
    }
    return null;
  } catch (e) {
    console.log('[Firestore] getSettingsFromCloud error:', e?.message);
    return null;
  }
}

// ─── REACTIONS (Like / Dislike) ───────────────────────────────────────────────
//
// anime/{animeId}                  ← { likes: N, dislikes: N, animeId, animeTitle }
// anime/{animeId}/reactions/{uid}  ← { reaction: 'like'|'dislike', uid, displayName, animeId, reactedAt }

/**
 * Get current like/dislike counts + this user's reaction (null if guest/not voted).
 * Returns: { likes, dislikes, userReaction: 'like'|'dislike'|null }
 */
export async function getReactionState(animeId, uid = null) {
  try {
    const animeSnap = await getDoc(doc(db, 'anime', String(animeId)));
    const counts    = animeSnap.exists()
      ? { likes: animeSnap.data().likes || 0, dislikes: animeSnap.data().dislikes || 0 }
      : { likes: 0, dislikes: 0 };

    let userReaction = null;
    if (uid) {
      const rxSnap = await getDoc(doc(db, 'anime', String(animeId), 'reactions', uid));
      if (rxSnap.exists()) userReaction = rxSnap.data().reaction;
    }

    return { ...counts, userReaction };
  } catch (e) {
    console.log('[Firestore] getReactionState error:', e?.message);
    return { likes: 0, dislikes: 0, userReaction: null };
  }
}

/**
 * Toggle a user's reaction atomically via Firestore transaction.
 * - No reaction → add newReaction, increment count
 * - Same reaction → remove it (toggle off), decrement count
 * - Opposite reaction → switch: decrement old, increment new
 *
 * Returns: { likes, dislikes, userReaction }
 */
export async function toggleReaction(animeId, uid, displayName, animeTitle, newReaction) {
  if (!uid) throw new Error('Must be signed in to react');

  const animeRef    = doc(db, 'anime', String(animeId));
  const reactionRef = doc(db, 'anime', String(animeId), 'reactions', uid);

  let out = { likes: 0, dislikes: 0, userReaction: null };

  await runTransaction(db, async (tx) => {
    const [animeSnap, rxSnap] = await Promise.all([tx.get(animeRef), tx.get(reactionRef)]);

    const cur = animeSnap.exists()
      ? { likes: animeSnap.data().likes || 0, dislikes: animeSnap.data().dislikes || 0 }
      : { likes: 0, dislikes: 0 };

    const prevReaction = rxSnap.exists() ? rxSnap.data().reaction : null;
    const isSame       = prevReaction === newReaction;

    const next = { ...cur, animeId: String(animeId), animeTitle: animeTitle || '' };

    if (isSame) {
      // Toggle OFF
      next[newReaction === 'like' ? 'likes' : 'dislikes'] = Math.max(0, cur[newReaction === 'like' ? 'likes' : 'dislikes'] - 1);
      tx.delete(reactionRef);
      out.userReaction = null;
    } else {
      // Switch from opposite or add fresh
      if (prevReaction) {
        next[prevReaction === 'like' ? 'likes' : 'dislikes'] = Math.max(0, cur[prevReaction === 'like' ? 'likes' : 'dislikes'] - 1);
      }
      next[newReaction === 'like' ? 'likes' : 'dislikes'] = (cur[newReaction === 'like' ? 'likes' : 'dislikes'] || 0) + 1;
      tx.set(reactionRef, {
        reaction: newReaction, uid, displayName: displayName || '',
        animeId: String(animeId), animeTitle: animeTitle || '',
        reactedAt: serverTimestamp(),
      });
      out.userReaction = newReaction;
    }

    tx.set(animeRef, next, { merge: true });
    out.likes    = next.likes    ?? cur.likes;
    out.dislikes = next.dislikes ?? cur.dislikes;
  });

  return out;
}

/**
 * Get all users who reacted to an anime.
 * Returns: [{ uid, displayName, reaction, reactedAt }]
 */
export async function getAnimeReactions(animeId) {
  try {
    const snap = await getDocs(collection(db, 'anime', String(animeId), 'reactions'));
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.log('[Firestore] getAnimeReactions error:', e?.message);
    return [];
  }
}

// ─── COMMENTS ─────────────────────────────────────────────────────────────────
//
// anime/{animeId}/comments/{commentId}
//   ← { uid, displayName, photoURL, text, spoiler, likes, dislikes, replyCount, createdAt }
// anime/{animeId}/comments/{commentId}/replies/{replyId}
//   ← { uid, displayName, photoURL, text, likes, createdAt }
// anime/{animeId}/comments/{commentId}/reactions/{uid}
//   ← { reaction: 'like'|'dislike' }

/**
 * Post a new top-level comment.
 * Returns the new comment's Firestore ID.
 */
export async function postComment(animeId, { uid, displayName, photoURL, text, spoiler }) {
  const col = collection(db, 'anime', String(animeId), 'comments');
  const ref = await addDoc(col, {
    uid,
    displayName: displayName || 'User',
    photoURL:    photoURL    || '',
    text,
    spoiler:     !!spoiler,
    likes:       0,
    dislikes:    0,
    replyCount:  0,
    createdAt:   serverTimestamp(),
  });
  // Increment aggregate commentCount on the anime doc
  await setDoc(doc(db, 'anime', String(animeId)), { commentCount: increment(1) }, { merge: true });
  return ref.id;
}

/**
 * Subscribe to comments in real-time (newest first).
 * Returns an unsubscribe function.
 */
export function subscribeToComments(animeId, callback, onError) {
  const q = query(
    collection(db, 'anime', String(animeId), 'comments'),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => {
      console.log('[Firestore] subscribeToComments error:', err.message);
      if (onError) onError(err);
    }
  );
}

/**
 * Get total comment count for an anime.
 */
export async function getCommentCount(animeId) {
  try {
    const snap = await getDoc(doc(db, 'anime', String(animeId)));
    return snap.exists() ? (snap.data().commentCount || 0) : 0;
  } catch {
    return 0;
  }
}

/**
 * Get the most recent top-level comment for an anime to display in the preview.
 */
export async function getTopComment(animeId) {
  try {
    const q = query(
      collection(db, 'anime', String(animeId), 'comments'),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const doc = snap.docs[0];
      return { id: doc.id, ...doc.data() };
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Toggle like/dislike on a comment atomically.
 * Returns { likes, dislikes, userReaction }.
 */
export async function toggleCommentReaction(animeId, commentId, uid, reaction) {
  const commentRef  = doc(db, 'anime', String(animeId), 'comments', commentId);
  const reactionRef = doc(db, 'anime', String(animeId), 'comments', commentId, 'reactions', uid);

  let out = { likes: 0, dislikes: 0, userReaction: null };

  await runTransaction(db, async (tx) => {
    const [cSnap, rSnap] = await Promise.all([tx.get(commentRef), tx.get(reactionRef)]);

    const cur = cSnap.exists()
      ? { likes: cSnap.data().likes || 0, dislikes: cSnap.data().dislikes || 0 }
      : { likes: 0, dislikes: 0 };

    const prev   = rSnap.exists() ? rSnap.data().reaction : null;
    const isSame = prev === reaction;
    const next   = { ...cur };

    if (isSame) {
      next[reaction === 'like' ? 'likes' : 'dislikes'] = Math.max(0, cur[reaction === 'like' ? 'likes' : 'dislikes'] - 1);
      tx.delete(reactionRef);
      out.userReaction = null;
    } else {
      if (prev) next[prev === 'like' ? 'likes' : 'dislikes'] = Math.max(0, cur[prev === 'like' ? 'likes' : 'dislikes'] - 1);
      next[reaction === 'like' ? 'likes' : 'dislikes'] = (cur[reaction === 'like' ? 'likes' : 'dislikes'] || 0) + 1;
      tx.set(reactionRef, { reaction, uid, createdAt: serverTimestamp() });
      out.userReaction = reaction;
    }
    tx.set(commentRef, next, { merge: true });
    out.likes    = next.likes;
    out.dislikes = next.dislikes;
  });

  return out;
}

/**
 * Post a reply to a comment.
 */
export async function postReply(animeId, commentId, { uid, displayName, photoURL, text }) {
  const col = collection(db, 'anime', String(animeId), 'comments', commentId, 'replies');
  await addDoc(col, {
    uid,
    displayName: displayName || 'User',
    photoURL:    photoURL    || '',
    text,
    likes:       0,
    createdAt:   serverTimestamp(),
  });
  // Increment replyCount on parent comment
  await setDoc(doc(db, 'anime', String(animeId), 'comments', commentId), { replyCount: increment(1) }, { merge: true });
}

/**
 * Get all replies for a comment (oldest first).
 */
export async function getReplies(animeId, commentId) {
  try {
    const q    = query(collection(db, 'anime', String(animeId), 'comments', commentId, 'replies'), orderBy('createdAt', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.log('[Firestore] getReplies error:', e?.message);
    return [];
  }
}

/**
 * Delete a comment (only owner).
 */
export async function deleteComment(animeId, commentId) {
  await deleteDoc(doc(db, 'anime', String(animeId), 'comments', commentId));
  await setDoc(doc(db, 'anime', String(animeId)), { commentCount: increment(-1) }, { merge: true });
}
