import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, Image, ActivityIndicator, Keyboard, Platform,
  Animated, Alert, Pressable, PanResponder, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useAuthModal } from '../context/AuthModalContext';
import {
  subscribeToComments, postComment, toggleCommentReaction,
  getReplies, postReply, deleteComment,
} from '../api/firestore';

// ─── Time ago helper ──────────────────────────────────────────────────────────
function timeAgo(ts) {
  const now  = Date.now();
  const then = ts?.toDate?.()?.getTime?.() ?? (ts?.seconds ? ts.seconds * 1000 : now);
  const diff = Math.floor((now - then) / 1000);
  if (diff < 5)       return 'just now';
  if (diff < 60)      return `${diff}s ago`;
  if (diff < 3600)    return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)   return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#4f46e5', '#7c3aed', '#db2777', '#dc2626', '#059669', '#0891b2', '#d97706'];
function Avatar({ uri, name, size = 36 }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const bg      = AVATAR_COLORS[initial.charCodeAt(0) % AVATAR_COLORS.length];
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1a1a1a' }}
      />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.42, fontWeight: '700' }}>{initial}</Text>
    </View>
  );
}

// ─── Comment Card ─────────────────────────────────────────────────────────────
function CommentCard({
  comment, animeId, userReaction, isOwner,
  onReaction, onReply, onDelete,
}) {
  const [showSpoiler,     setShowSpoiler]    = useState(false);
  const [expanded,        setExpanded]       = useState(false);
  const [replies,         setReplies]        = useState([]);
  const [loadingReplies,  setLoadingReplies] = useState(false);

  const handleViewReplies = async () => {
    if (expanded) { setExpanded(false); return; }
    setLoadingReplies(true);
    try {
      const data = await getReplies(animeId, comment.id);
      setReplies(data);
      setExpanded(true);
    } catch { /* ignore */ } finally {
      setLoadingReplies(false);
    }
  };

  const likeCount    = comment.likes    || 0;
  const dislikeCount = comment.dislikes || 0;

  return (
    <View style={CC.container}>
      {/* Thread line */}
      {(comment.replyCount > 0 || expanded) && (
        <View style={{ position: 'absolute', top: 52, bottom: 20, left: 34, width: 20, borderBottomWidth: 1.5, borderLeftWidth: 1.5, borderColor: '#3f3f46', borderBottomLeftRadius: 12 }} />
      )}
      {/* Left avatar */}
      <Avatar uri={comment.photoURL} name={comment.displayName} size={36} />

      {/* Right content */}
      <View style={CC.content}>
        {/* Meta */}
        <View style={CC.metaRow}>
          <Text style={CC.username}>{comment.displayName}</Text>
          <Text style={CC.time}>{timeAgo(comment.createdAt)}</Text>
        </View>

        {/* Body */}
        {comment.spoiler && !showSpoiler ? (
          <TouchableOpacity style={CC.spoilerBlur} onPress={() => setShowSpoiler(true)}>
            <Ionicons name="eye-off-outline" size={14} color="#9ca3af" />
            <Text style={CC.spoilerLabel}>Spoiler — tap to reveal</Text>
          </TouchableOpacity>
        ) : (
          <Text style={CC.text}>{comment.text}</Text>
        )}

        {/* Actions row */}
        <View style={CC.actions}>
          {/* Like */}
          <TouchableOpacity style={CC.actionBtn} onPress={() => onReaction('like')} activeOpacity={0.7}>
            <Ionicons
              name={userReaction === 'like' ? 'thumbs-up' : 'thumbs-up-outline'}
              size={14}
              color={userReaction === 'like' ? '#22c55e' : '#6b7280'}
            />
            <Text style={[CC.actionCount, userReaction === 'like' && { color: '#22c55e' }]}>
              {likeCount}
            </Text>
          </TouchableOpacity>

          {/* Dislike */}
          <TouchableOpacity style={CC.actionBtn} onPress={() => onReaction('dislike')} activeOpacity={0.7}>
            <Ionicons
              name={userReaction === 'dislike' ? 'thumbs-down' : 'thumbs-down-outline'}
              size={14}
              color={userReaction === 'dislike' ? '#ef4444' : '#6b7280'}
            />
            {dislikeCount > 0 && (
              <Text style={[CC.actionCount, userReaction === 'dislike' && { color: '#ef4444' }]}>
                {dislikeCount}
              </Text>
            )}
          </TouchableOpacity>

          {/* Reply */}
          <TouchableOpacity style={CC.actionBtn} onPress={onReply} activeOpacity={0.7}>
            <Text style={CC.replyText}>Reply</Text>
          </TouchableOpacity>

          {/* More (delete own) */}
          {isOwner && (
            <TouchableOpacity style={CC.actionBtn} onPress={onDelete} activeOpacity={0.7}>
              <Ionicons name="ellipsis-horizontal" size={16} color="#4b5563" />
            </TouchableOpacity>
          )}
        </View>

        {/* View replies */}
        {(comment.replyCount > 0 || expanded) && (
          <TouchableOpacity style={CC.viewRepliesRow} onPress={handleViewReplies} activeOpacity={0.7}>
            {loadingReplies ? (
              <ActivityIndicator size="small" color="#fff" style={{ marginLeft: 8 }} />
            ) : (
              <Text style={CC.viewRepliesText}>
                {expanded
                  ? `Hide replies`
                  : `View ${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}`}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* Inline replies */}
        {expanded && replies.map(reply => (
          <View key={reply.id} style={CC.replyCard}>
            <Avatar uri={reply.photoURL} name={reply.displayName} size={28} />
            <View style={CC.replyContent}>
              <View style={CC.metaRow}>
                <Text style={[CC.username, { fontSize: 12 }]}>{reply.displayName}</Text>
                <Text style={CC.time}>{timeAgo(reply.createdAt)}</Text>
              </View>
              <Text style={[CC.text, { fontSize: 13 }]}>{reply.text}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const CC = StyleSheet.create({
  container:     { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  content:       { flex: 1 },
  metaRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  username:      { color: '#fff', fontSize: 13, fontWeight: '700' },
  time:          { color: '#6b7280', fontSize: 11 },
  text:          { color: '#d1d5db', fontSize: 14, lineHeight: 20 },
  spoilerBlur:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  spoilerLabel:  { color: '#9ca3af', fontSize: 12 },
  actions:       { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  actionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionCount:   { color: '#9ca3af', fontSize: 12, fontWeight: '600' },
  replyText:     { color: '#9ca3af', fontSize: 12, fontWeight: '600' },
  viewRepliesRow:{ flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  viewRepliesText:{ color: '#3b82f6', fontSize: 13, fontWeight: '600', paddingLeft: 12 },
  replyCard:     { flexDirection: 'row', gap: 8, marginTop: 10, paddingLeft: 4 },
  replyContent:  { flex: 1 },
});

// ─── Main Comments Sheet ──────────────────────────────────────────────────────
export default function CommentsSheet({ visible, onClose, animeId, animeTitle, asModal = true }) {
  const { user }          = useAuth();
  const { openAuthModal } = useAuthModal();

  const [comments,      setComments]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [text,          setText]          = useState('');
  const [spoiler,       setSpoiler]       = useState(false);
  const [sending,       setSending]       = useState(false);
  const [sortBy,        setSortBy]        = useState('newest');
  const [showSortMenu,  setShowSortMenu]  = useState(false);
  const [replyingTo,    setReplyingTo]    = useState(null); // { commentId, displayName }
  const [userReactions, setUserReactions] = useState({});   // { [commentId]: 'like'|'dislike' }

  const inputRef      = useRef(null);
  const kbOffset      = useRef(new Animated.Value(0)).current;
  const unsubRef      = useRef(null);

  const screenHeight = Dimensions.get('window').height;
  const slideY = useRef(new Animated.Value(screenHeight)).current;
  const [internalVisible, setInternalVisible] = useState(visible);

  useEffect(() => {
    if (visible) {
      setInternalVisible(true);
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    } else {
      Animated.timing(slideY, { toValue: screenHeight, duration: 250, useNativeDriver: true }).start(() => {
        setInternalVisible(false);
      });
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) {
          slideY.setValue(g.dy);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 1) {
          handleClose();
        } else {
          Animated.spring(slideY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        }
      }
    })
  ).current;

  // ── Subscribe to comments ─────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !animeId) return;
    setLoading(true);
    setComments([]);
    const unsub = subscribeToComments(
      animeId, 
      (data) => {
        setComments(data);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
      }
    );
    unsubRef.current = unsub;
    return () => { unsub(); unsubRef.current = null; };
  }, [visible, animeId]);

  // ── Keyboard shift ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => Animated.spring(kbOffset, { toValue: e.endCoordinates.height, useNativeDriver: false, speed: 20, bounciness: 0 }).start()
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => Animated.spring(kbOffset, { toValue: 0, useNativeDriver: false, speed: 20, bounciness: 0 }).start()
    );
    return () => { show.remove(); hide.remove(); };
  }, [visible]);

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sorted = sortBy === 'popular'
    ? [...comments].sort((a, b) => (b.likes || 0) - (a.likes || 0))
    : comments; // already newest-first from Firestore

  // ── Post comment / reply ──────────────────────────────────────────────────
  const handlePost = async () => {
    if (!user) { openAuthModal(); return; }
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    Keyboard.dismiss();
    setSending(true);
    try {
      if (replyingTo) {
        await postReply(animeId, replyingTo.commentId, {
          uid: user.uid, displayName: user.displayName || 'User',
          photoURL: user.photoURL || '', text: trimmed,
        });
        setReplyingTo(null);
      } else {
        await postComment(animeId, {
          uid: user.uid, displayName: user.displayName || 'User',
          photoURL: user.photoURL || '', text: trimmed, spoiler,
        });
      }
      setText('');
      setSpoiler(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to post. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // ── Comment reaction ──────────────────────────────────────────────────────
  const handleCommentReaction = async (commentId, reaction) => {
    if (!user) { openAuthModal(); return; }

    const prev = userReactions[commentId] || null;
    // Optimistic update
    setUserReactions(r => ({ ...r, [commentId]: prev === reaction ? null : reaction }));
    setComments(cs => cs.map(c => {
      if (c.id !== commentId) return c;
      const cur  = { likes: c.likes || 0, dislikes: c.dislikes || 0 };
      const next = { ...cur };
      if (prev === reaction) {
        next[reaction === 'like' ? 'likes' : 'dislikes'] = Math.max(0, cur[reaction === 'like' ? 'likes' : 'dislikes'] - 1);
      } else {
        if (prev) next[prev === 'like' ? 'likes' : 'dislikes'] = Math.max(0, cur[prev === 'like' ? 'likes' : 'dislikes'] - 1);
        next[reaction === 'like' ? 'likes' : 'dislikes'] = (cur[reaction === 'like' ? 'likes' : 'dislikes'] || 0) + 1;
      }
      return { ...c, ...next };
    }));
    try {
      const result = await toggleCommentReaction(animeId, commentId, user.uid, reaction);
      setUserReactions(r => ({ ...r, [commentId]: result.userReaction }));
      setComments(cs => cs.map(c => c.id === commentId ? { ...c, likes: result.likes, dislikes: result.dislikes } : c));
    } catch {
      setUserReactions(r => ({ ...r, [commentId]: prev }));
    }
  };

  // ── Delete comment ────────────────────────────────────────────────────────
  const handleDelete = (commentId) => {
    Alert.alert('Delete Comment', 'Remove this comment?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteComment(animeId, commentId);
        } catch (e) {
          Alert.alert('Error', 'Could not delete comment.');
        }
      }},
    ]);
  };

  // ── Close ─────────────────────────────────────────────────────────────────
  const handleClose = () => {
    Keyboard.dismiss();
    setReplyingTo(null);
    setText('');
    onClose();
  };

  const commentCount = comments.length;

  const content = (
    <Animated.View style={[asModal ? CS.sheet : CS.inlineSheet, { transform: [{ translateY: slideY }] }]}>
      <Animated.View style={{ flex: 1, marginBottom: kbOffset }}>
        {/* Drag Handle and Header Wrapper */}
        <View {...panResponder.panHandlers} style={{ backgroundColor: 'transparent' }}>
          {/* Handle bar */}
          <View style={CS.handleWrap}>
            <View style={CS.handle} />
          </View>

          {/* ── Header ─────────────────────────────────────────────────── */}
          <View style={CS.header}>
            <Text style={CS.headerTitle}>
              Comments{' '}
              <Text style={CS.headerCount}>{commentCount}</Text>
            </Text>
            <View style={CS.headerRight}>
              <TouchableOpacity style={CS.iconBtn} onPress={() => setShowSortMenu(s => !s)}>
                <Ionicons name="filter-outline" size={20} color="#9ca3af" />
              </TouchableOpacity>
              <TouchableOpacity style={CS.iconBtn} onPress={handleClose}>
                <Ionicons name="close" size={22} color="#9ca3af" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

          {/* ── Sort menu ──────────────────────────────────────────────── */}
          {showSortMenu && (
            <View style={CS.sortMenu}>
              {[
                { key: 'newest',  label: 'Newest First' },
                { key: 'popular', label: 'Most Popular' },
              ].map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={CS.sortOption}
                  onPress={() => { setSortBy(opt.key); setShowSortMenu(false); }}
                >
                  <Text style={[CS.sortText, sortBy === opt.key && CS.sortTextActive]}>
                    {opt.label}
                  </Text>
                  {sortBy === opt.key && <Ionicons name="checkmark" size={16} color="#a78bfa" />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Comment list ───────────────────────────────────────────── */}
          {loading ? (
            <View style={CS.loadingWrap}>
              <ActivityIndicator color="#a78bfa" size="large" />
              <Text style={CS.loadingText}>Loading comments…</Text>
            </View>
          ) : (
            <FlatList
              data={sorted}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={sorted.length === 0 ? CS.emptyContainer : undefined}
              renderItem={({ item }) => (
                <CommentCard
                  comment={item}
                  animeId={animeId}
                  userReaction={userReactions[item.id] || null}
                  isOwner={user?.uid === item.uid}
                  onReaction={(r) => handleCommentReaction(item.id, r)}
                  onReply={() => {
                    setReplyingTo({ commentId: item.id, displayName: item.displayName });
                    setTimeout(() => inputRef.current?.focus(), 100);
                  }}
                  onDelete={() => handleDelete(item.id)}
                />
              )}
              ListEmptyComponent={
                <View style={CS.emptyWrap}>
                  <Text style={CS.emptyTitle}>No comments yet :(</Text>
                </View>
              }
            />
          )}

          {/* ── Bottom input bar ───────────────────────────────────────── */}
          <View style={CS.inputBarWrap}>
            {/* Replying banner */}
            {replyingTo && (
              <View style={CS.replyBanner}>
                <Text style={CS.replyBannerText}>
                  Replying to{' '}
                  <Text style={{ color: '#a78bfa', fontWeight: '700' }}>{replyingTo.displayName}</Text>
                </Text>
                <TouchableOpacity onPress={() => { setReplyingTo(null); setText(''); }}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}

            {user ? (
              <View style={CS.inputRow}>
                <TextInput
                  ref={inputRef}
                  style={CS.input}
                  value={text}
                  onChangeText={setText}
                  placeholder={
                    replyingTo
                      ? `Reply to ${replyingTo.displayName}…`
                      : 'Add a comment'
                  }
                  placeholderTextColor="#6b7280"
                  multiline
                  maxLength={1000}
                />
                
                <View style={CS.inputBottomRow}>
                  {!replyingTo && (
                    <TouchableOpacity style={CS.spoilerToggle} onPress={() => setSpoiler(s => !s)}>
                      <Ionicons name={spoiler ? "checkbox" : "square-outline"} size={18} color={spoiler ? "#fff" : "#6b7280"} />
                      <Text style={CS.spoilerToggleText}>Spoiler</Text>
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity style={CS.emojiBtn}>
                    <Ionicons name="happy-outline" size={18} color="#9ca3af" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[CS.sendBtn, !text.trim() && CS.sendBtnDisabled]}
                    onPress={handlePost}
                    disabled={sending || !text.trim()}
                    activeOpacity={0.8}
                  >
                    {sending
                      ? <ActivityIndicator size="small" color="#000" />
                      : <Ionicons name="arrow-up" size={18} color={text.trim() ? '#000' : '#4b5563'} />
                    }
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* Guest — prompt to sign in */
              <TouchableOpacity style={CS.signInRow} onPress={openAuthModal} activeOpacity={0.8}>
                <Ionicons name="person-circle-outline" size={22} color="#6b7280" />
                <Text style={CS.signInText}>Sign in to comment</Text>
                <Ionicons name="chevron-forward" size={16} color="#4b5563" />
              </TouchableOpacity>
            )}
          </View>

        </Animated.View>
      </Animated.View>
  );

  if (!internalVisible) return null;

  if (!asModal) {
    return content;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={CS.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        {content}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const CS = StyleSheet.create({
  backdrop:     { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:        { backgroundColor: '#171717', borderTopLeftRadius: 22, borderTopRightRadius: 22, height: '82%', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  inlineSheet:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#18181b', borderTopLeftRadius: 16, borderTopRightRadius: 16, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.5, shadowRadius: 10 },

  // Handle
  handleWrap:   { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle:       { width: 36, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2 },

  // Header
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#27272a' },
  headerTitle:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerCount:  { color: '#9ca3af', fontWeight: '500', fontSize: 13, marginLeft: 2 },
  headerRight:  { flexDirection: 'row', gap: 4 },
  iconBtn:      { padding: 8 },

  // Sort menu
  sortMenu:     { backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#222' },
  sortOption:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  sortText:     { color: '#9ca3af', fontSize: 14 },
  sortTextActive:{ color: '#fff', fontWeight: '700' },

  // Loading / empty
  loadingWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText:  { color: '#6b7280', fontSize: 13 },
  emptyContainer:{ flex: 1 },
  emptyWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  emptyTitle:   { color: '#9ca3af', fontSize: 15, fontWeight: '400' },

  // Input bar
  inputBarWrap: { paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#27272a' },
  replyBanner:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#1a1a1a' },
  replyBannerText: { color: '#9ca3af', fontSize: 12, flex: 1 },
  inputRow:     { backgroundColor: '#27272a', borderRadius: 16, padding: 12 },
  input:        { color: '#fff', fontSize: 15, minHeight: 40, textAlignVertical: 'top' },
  inputBottomRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 8 },
  spoilerToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  spoilerToggleText: { color: '#9ca3af', fontSize: 13 },
  emojiBtn:     { width: 32, height: 32, borderRadius: 16, backgroundColor: '#3f3f46', alignItems: 'center', justifyContent: 'center' },
  sendBtn:      { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled:{ backgroundColor: '#3f3f46' },
  signInRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  signInText:   { color: '#9ca3af', fontSize: 14, flex: 1 },
});
