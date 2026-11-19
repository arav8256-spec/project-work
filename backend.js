/* Supabase browser client. Database access is protected by the RLS policies in supabase-schema.sql. */
(function () {
  'use strict';
  const cfg = window.MISSION_SUPABASE_CONFIG || {};
  const configured = !!(window.supabase && cfg.url && cfg.anonKey && !cfg.url.includes('YOUR_PROJECT_ID') && !cfg.anonKey.includes('YOUR_SUPABASE'));
  const client = configured ? window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;

  async function requireClient() {
    if (!client) throw new Error('Cloud is not configured. Add your Supabase project URL and anon key to supabase-config.js.');
    return client;
  }
  async function getMyProfile() {
    await requireClient();
    const { data:{ user }, error:userError } = await client.auth.getUser();
    if (userError) throw userError;
    if (!user) return null;
    const { data, error } = await client.from('user_profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return data ? { ...data, ...(data.state || {}) } : null;
  }
  async function ensureMyProfile(name) {
    await requireClient();
    const { data:{ user }, error:userError } = await client.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error('Please log in again.');
    const existing = await getMyProfile();
    if (existing) return existing;
    const profile = { id:user.id, name:name || user.email.split('@')[0], username:user.email, role:'student', state:{} };
    const { data, error } = await client.from('user_profiles').insert(profile).select('*').single();
    if (error) throw error;
    return { ...data, ...(data.state || {}) };
  }
  async function saveMyProfile(state) {
    await requireClient();
    const { data:{ user }, error:userError } = await client.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error('Not authenticated');
    const current = await getMyProfile();
    const payload = { id:user.id, name:current?.name || user.user_metadata?.full_name || user.email.split('@')[0], username:user.email, role:current?.role || 'student', state:state || {}, updated_at:new Date().toISOString() };
    const { error } = await client.from('user_profiles').upsert(payload, { onConflict:'id' });
    if (error) throw error;
  }
  async function saveStudent(student) {
    await requireClient();
    if (!student || !student.id) return;
    // Existing cloud student rows are updated by their UUID; admin RLS policy authorizes this.
    const { error } = await client.from('user_profiles').update({
      name:student.name, username:student.username || null,
      state:{ lectures:student.lectures || {}, mocks:student.mocks || {}, dailyTargets:student.dailyTargets || {}, dailyTimetables:student.dailyTimetables || {}, streak:student.streak || 1, lastActiveDate:student.lastActiveDate || '', mentorFeedback:student.mentorFeedback || '', mentorNoticeDismissed:!!student.mentorNoticeDismissed },
      updated_at:new Date().toISOString()
    }).eq('id', student.id);
    if (error) throw error;
  }
  let realtimeChannel = null;
  function subscribeChanges(callback) {
    if (!client || realtimeChannel) return;
    realtimeChannel = client.channel('mission-user-profile-sync').on('postgres_changes', { event:'*', schema:'public', table:'user_profiles' }, payload => { if (typeof callback === 'function') callback(payload); }).subscribe();
  }
  async function listStudents() {
    await requireClient();
    const { data, error } = await client.from('user_profiles').select('*').eq('role','student').order('created_at',{ascending:true});
    if (error) throw error;
    return data || [];
  }
  window.MissionCloud = {
    isReady:() => configured,
    getSession:async () => { await requireClient(); const { data,error } = await client.auth.getSession(); if(error) throw error; return data.session; },
    signIn:async (email,password) => { await requireClient(); const { data,error } = await client.auth.signInWithPassword({email,password}); if(error) throw error; const profile = await getMyProfile(); return {user:data.user,session:data.session,profile}; },
    signUp:async (email,password,name) => { await requireClient(); const { data,error } = await client.auth.signUp({email,password,options:{data:{full_name:name}}}); if(error) throw error; return {user:data.user,session:data.session}; },
    signOut:async () => { if(client) { const {error } = await client.auth.signOut(); if(error) throw error; } },
    getMyProfile, ensureMyProfile, saveMyProfile, saveStudent, listStudents, subscribeChanges
  };
})();
