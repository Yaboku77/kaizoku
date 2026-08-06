import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, Image, ActivityIndicator, Keyboard, Platform,
  Animated, Alert, Pressable, PanResponder, Dimensions,
  KeyboardAvoidingView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAnimeThreads, fetchThreadComments, saveThreadComment, saveThread } from '../api/anilist';

// ─── Time ago helper
function timeAgo(ts) {
  const now = Date.now();
  const then = ts * 1000;
  const diff = Math.floor((now - then) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

// ─── Avatar
const AVATAR_COLORS = ['#4f46e5', '#7c3aed', '#db2777', '#dc2626', '#059669', '#0891b2', '#d97706'];
function Avatar({ uri, name, size = 36 }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const bg = AVATAR_COLORS[initial.charCodeAt(0) % AVATAR_COLORS.length];
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

// ─── HTML/GIF Parser
function renderCommentContent(htmlStr) {
  if (!htmlStr) return null;
  
  let s = htmlStr.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/p>\s*<p>/gi, '\n\n');
  s = s.replace(/<\/?p>/gi, '');
  
  const imgRegex = /<img[^>]+src="([^">]+)"[^>]*>/gi;
  const parts = [];
  let lastIndex = 0;
  let match;
  
  while ((match = imgRegex.exec(s)) !== null) {
    const textBefore = s.substring(lastIndex, match.index);
    if (textBefore) {
      const clean = textBefore.replace(/<[^>]*>?/gm, '').trim();
      if (clean) parts.push({ type: 'text', content: clean + ' ' });
    }
    parts.push({ type: 'image', uri: match[1] });
    lastIndex = imgRegex.lastIndex;
  }
  
  const textAfter = s.substring(lastIndex);
  if (textAfter) {
    const clean = textAfter.replace(/<[^>]*>?/gm, '').trim();
    if (clean) parts.push({ type: 'text', content: ' ' + clean });
  }

  if (parts.length === 0) {
    const fallback = s.replace(/<[^>]*>?/gm, '').trim();
    return <Text style={CC.text}>{fallback}</Text>;
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
      {parts.map((p, i) => {
        if (p.type === 'image') {
          const isGif = p.uri.toLowerCase().includes('.gif');
          const size = isGif ? 120 : 28;
          return (
            <Image 
              key={i} 
              source={{ uri: p.uri }} 
              style={{ width: size, height: size, resizeMode: isGif ? 'contain' : 'cover', marginHorizontal: 2 }} 
            />
          );
        }
        return <Text key={i} style={CC.text}>{p.content}</Text>;
      })}
    </View>
  );
}

// ─── Comment Card
function CommentCard({ comment, onReply }) {
  const [expanded, setExpanded] = useState(false);
  const hasReplies = comment.replies && comment.replies.length > 0;
  
  return (
    <View style={CC.container}>
      {/* Thread line */}
      {(hasReplies || expanded) && (
        <View style={{ position: 'absolute', top: 52, bottom: 20, left: 34, width: 20, borderBottomWidth: 1.5, borderLeftWidth: 1.5, borderColor: '#3f3f46', borderBottomLeftRadius: 12 }} />
      )}
      <Avatar uri={comment.photoURL} name={comment.displayName} size={36} />
      <View style={CC.content}>
        <View style={CC.metaRow}>
          <Text style={CC.username}>{comment.displayName}</Text>
          <Text style={CC.time}>{timeAgo(comment.createdAt)}</Text>
        </View>
        {renderCommentContent(comment.text)}
        
        <View style={CC.actions}>
          <TouchableOpacity style={CC.actionBtn} activeOpacity={0.7}>
            <Ionicons name="thumbs-up-outline" size={16} color="#9ca3af" />
            <Text style={CC.actionText}>{comment.likeCount || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={CC.actionBtn} activeOpacity={0.7}>
            <Ionicons name="thumbs-down-outline" size={16} color="#9ca3af" />
          </TouchableOpacity>
          <TouchableOpacity style={CC.actionBtn} onPress={onReply} activeOpacity={0.7}>
            <Text style={CC.replyText}>Reply</Text>
          </TouchableOpacity>
          <TouchableOpacity style={CC.actionBtn} activeOpacity={0.7}>
            <Ionicons name="ellipsis-horizontal" size={16} color="#9ca3af" />
          </TouchableOpacity>
        </View>
        
        {hasReplies && (
          <TouchableOpacity style={CC.viewRepliesRow} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
            <Text style={CC.viewRepliesText}>
              {expanded ? 'Hide replies' : `View ${comment.replies.length} ${comment.replies.length === 1 ? 'reply' : 'replies'}`}
            </Text>
          </TouchableOpacity>
        )}
        
        {expanded && comment.replies?.map(reply => (
          <View key={reply.id} style={CC.replyCard}>
            <Avatar uri={reply.photoURL} name={reply.displayName} size={28} />
            <View style={CC.replyContent}>
              <View style={CC.metaRow}>
                <Text style={[CC.username, { fontSize: 12 }]}>{reply.displayName}</Text>
                <Text style={CC.time}>{timeAgo(reply.createdAt)}</Text>
              </View>
              {renderCommentContent(reply.text)}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const CC = StyleSheet.create({
  container: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  content: { flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  username: { color: '#fff', fontSize: 13, fontWeight: '700' },
  time: { color: '#6b7280', fontSize: 11 },
  text: { color: '#d1d5db', fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { color: '#9ca3af', fontSize: 13, fontWeight: '500' },
  replyText: { color: '#d1d5db', fontSize: 13, fontWeight: '600' },
  viewRepliesRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  viewRepliesText: { color: '#9ca3af', fontSize: 13, fontWeight: '600', paddingLeft: 12 },
  replyCard: { flexDirection: 'row', gap: 8, marginTop: 10, paddingLeft: 4 },
  replyContent: { flex: 1 },
});

export default function CommentsSheet({ visible, onClose, animeId, animeTitle, epNum, asModal = true }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  
  const [anilistToken, setAnilistToken] = useState(null);
  const [threadId, setThreadId] = useState(null);

  const lastFetched = useRef({ animeId: null, epNum: null });
  const screenHeight = Dimensions.get('window').height;
  const slideY = useRef(new Animated.Value(screenHeight)).current;
  const [internalVisible, setInternalVisible] = useState(visible);
  const kbOffset = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(0);
  
  useEffect(() => {
    if (visible) {
      setInternalVisible(true);
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    } else {
      Animated.timing(slideY, { toValue: screenHeight, duration: 250, useNativeDriver: true }).start(() => {
        setInternalVisible(false);
      });
    }
  }, [visible, slideY]);

  useEffect(() => {
    if (!visible) return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e => {
      Animated.spring(kbOffset, { toValue: e.endCoordinates.height, useNativeDriver: false, speed: 20, bounciness: 0 }).start();
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      Animated.spring(kbOffset, { toValue: 0, useNativeDriver: false, speed: 20, bounciness: 0 }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, [visible, kbOffset]);

  useEffect(() => {
    if (visible && animeId) {
      AsyncStorage.getItem('@anilist_token').then(t => setAnilistToken(t)).catch(() => {});
      if (lastFetched.current.animeId !== animeId || lastFetched.current.epNum !== epNum) {
        loadData();
      }
    }
  }, [visible, animeId, epNum]);

  const loadData = async () => {
    setLoading(true);
    lastFetched.current = { animeId, epNum };
    try {
      const ths = await fetchAnimeThreads(animeId);
      let targetThreads = ths || [];
      
      if (epNum) {
        const epMatches = targetThreads.filter(t => 
          t.title.toLowerCase().includes(`episode ${epNum}`) || 
          t.title.toLowerCase().includes(`ep ${epNum}`) ||
          t.title.toLowerCase().includes(`ep. ${epNum}`) ||
          t.title.toLowerCase().includes(`ep${epNum}`)
        );
        if (epMatches.length > 0) {
          targetThreads = epMatches;
        }
      }
      
      const sorted = targetThreads.sort((a, b) => (b.replyCount || 0) - (a.replyCount || 0));
      if (sorted.length > 0) {
        const topThread = sorted[0];
        setThreadId(topThread.id);
        const list = await fetchThreadComments(topThread.id);
        const mapped = (list || []).map(c => ({
          id: String(c.id),
          photoURL: c.user?.avatar?.medium,
          displayName: c.user?.name,
          createdAt: c.createdAt,
          text: c.comment,
          likeCount: c.likeCount || 0,
          replies: (c.childComments || []).map(r => ({
            id: String(r.id),
            photoURL: r.user?.avatar?.medium,
            displayName: r.user?.name,
            createdAt: r.createdAt,
            text: r.comment,
            likeCount: r.likeCount || 0,
          }))
        }));
        setComments(mapped);
      } else {
        setThreadId(null);
        setComments([]);
      }
    } catch (e) {
      console.log(e);
      setComments([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async () => {
    if (!anilistToken) {
      Alert.alert('AniList Login Required', 'Please connect your AniList account in Settings to reply.');
      return;
    }
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    Keyboard.dismiss();
    setSending(true);
    try {
      let finalTrimmed = trimmed;
      if (spoiler) {
        finalTrimmed = `~!\n${trimmed}\n!~`;
      }
      
      let tId = threadId;
      if (!tId) {
        const tTitle = epNum ? `Episode ${epNum} Discussion` : 'General Discussion';
        const tBody = epNum 
          ? `Discussion for ${animeTitle || 'this anime'} Episode ${epNum}` 
          : `General discussion for ${animeTitle || 'this anime'}`;
        const t = await saveThread(anilistToken, tTitle, tBody, animeId);
        tId = t.id;
        setThreadId(tId);
      }
      await saveThreadComment(anilistToken, tId, finalTrimmed, replyingTo?.commentId);
      setText('');
      setSpoiler(false);
      setReplyingTo(null);
      await loadData();
    } catch (e) {
      Alert.alert('Error', 'Failed to post reply.');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    Keyboard.dismiss();
    setText('');
    setSpoiler(false);
    setReplyingTo(null);
    onClose();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 5 && scrollY.current <= 0,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) slideY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 1) handleClose();
        else Animated.spring(slideY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      }
    })
  ).current;

  const content = (
    <Animated.View {...panResponder.panHandlers} style={[asModal ? CS.sheet : CS.inlineSheet, { transform: [{ translateY: slideY }] }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ backgroundColor: 'transparent' }}>
          <View style={CS.handleWrap}><View style={CS.handle} /></View>
          <View style={CS.header}>
            <Text style={CS.headerTitle}>Comments <Text style={CS.headerCount}>{comments.length}</Text></Text>
            <View style={CS.headerRight}>
              <TouchableOpacity style={CS.iconBtn} onPress={handleClose}>
                <Ionicons name="close" size={22} color="#9ca3af" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={CS.loadingWrap}>
            <ActivityIndicator color="#a78bfa" size="large" />
            <Text style={CS.loadingText}>Loading comments…</Text>
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={comments.length === 0 ? CS.emptyContainer : undefined}
            onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            renderItem={({ item }) => (
              <CommentCard 
                comment={item} 
                onReply={() => setReplyingTo({ commentId: item.id, displayName: item.displayName })} 
              />
            )}
            ListEmptyComponent={
              <View style={CS.emptyWrap}>
                <Text style={CS.emptyTitle}>No comments yet :(</Text>
              </View>
            }
          />
        )}

        <View style={CS.inputBarWrap}>
          {replyingTo && (
            <View style={CS.replyBanner}>
              <Text style={CS.replyBannerText} numberOfLines={1}>
                Replying to <Text style={{ color: '#fff', fontWeight: '600' }}>{replyingTo.displayName}</Text>
              </Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={16} color="#9ca3af" />
              </TouchableOpacity>
            </View>
          )}
          {anilistToken ? (
            <View style={CS.inputRow}>
              <TextInput style={CS.input} placeholder="Add a comment" placeholderTextColor="#9ca3af" multiline value={text} onChangeText={setText} />
              <View style={CS.inputBottomRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} onPress={() => setSpoiler(!spoiler)} activeOpacity={0.7}>
                    <Ionicons name={spoiler ? "checkbox" : "square-outline"} size={16} color={spoiler ? "#a78bfa" : "#9ca3af"} />
                    <Text style={{ color: '#9ca3af', fontSize: 13 }}>Spoiler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.7}>
                    <Ionicons name="document-text-outline" size={18} color="#9ca3af" />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={[CS.sendBtn, (!text.trim() || sending) && CS.sendBtnDisabled]} onPress={handlePost} disabled={sending || !text.trim()} activeOpacity={0.8}>
                  {sending ? <ActivityIndicator size="small" color="#000" /> : <Ionicons name="arrow-up" size={18} color={text.trim() ? '#000' : '#4b5563'} />}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={CS.signInRow} onPress={() => Alert.alert('Connect AniList', 'Please connect your AniList account in Settings to comment.')} activeOpacity={0.8}>
              <Ionicons name="person-circle-outline" size={22} color="#6b7280" />
              <Text style={CS.signInText}>Sign in with AniList to comment</Text>
              <Ionicons name="chevron-forward" size={16} color="#4b5563" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );

  if (!internalVisible) return null;
  if (!asModal) return content;
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
      <View style={CS.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        {content}
      </View>
    </Modal>
  );
}

// ─── Styles ───
const CS = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: '#171717', borderTopLeftRadius: 22, borderTopRightRadius: 22, height: '82%', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  inlineSheet: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#18181b', borderTopLeftRadius: 16, borderTopRightRadius: 16, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.5, shadowRadius: 10 },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle: { width: 36, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#27272a' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerCount: { color: '#9ca3af', fontWeight: '500', fontSize: 13, marginLeft: 2 },
  headerRight: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 8 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#6b7280', fontSize: 13 },
  emptyContainer: { flex: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { color: '#9ca3af', fontSize: 15, fontWeight: '400' },
  inputBarWrap: { paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#27272a' },
  inputRow: { backgroundColor: '#27272a', borderRadius: 16, padding: 12 },
  input: { color: '#fff', fontSize: 15, minHeight: 40, textAlignVertical: 'top' },
  inputBottomRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 8 },
  sendBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#3f3f46' },
  signInRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  signInText: { color: '#9ca3af', fontSize: 14, flex: 1 },
  replyBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#1a1a1a' },
  replyBannerText: { color: '#9ca3af', fontSize: 12, flex: 1 },
});
