import React, { useState, useEffect, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import {
  Plus, Trash2, Trophy, X, Check, ChevronLeft, ChevronUp, ChevronDown, MoreVertical,
  Wine, Users, UserPlus, Home, Archive, ArchiveRestore, Pencil, Skull
} from "lucide-react";
import { supabase } from "./supabaseClient";

// ---------- Supabase row <-> app-shape conversion ----------
function rowToPlayer(row) {
  return { id: row.id, name: row.name, archived: row.archived, createdAt: row.created_at };
}
function rowToGame(row) {
  return {
    id: row.id,
    title: row.title,
    playerIds: row.player_ids,
    rounds: row.rounds,
    drinkingMode: row.drinking_mode,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}
function gameToRow(game, status) {
  return {
    id: game.id,
    title: game.title,
    player_ids: game.playerIds,
    rounds: game.rounds,
    drinking_mode: game.drinkingMode,
    status,
    started_at: game.startedAt,
    finished_at: game.finishedAt || null,
  };
}

const PALETTE = {
  rail: "#1B2A3D",
  railDeep: "#121D2B",
  cream: "#F2EFE6",
  brass: "#C08A3E",
  brassLight: "#D9A94F",
  slate: "#7E91A9",
  red: "#C57C79",
  green: "#549E79",
  blue: "#6395B9",
  purple: "#9D86B6",
  purpleLight: "#B79FC7",
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Who drinks this round: lowest score, highest score, and middle (median) score(s).
function getDrinkFlags(scores) {
  const n = scores.length;
  const nums = scores.map((s) => Number(s) || 0);
  const empty = nums.map(() => ({ low: false, high: false, middle: false }));
  if (n < 2) return empty;
  const sorted = [...nums].sort((a, b) => a - b);
  const lowValue = sorted[0];
  const highValue = sorted[n - 1];
  let middleValues = [];
  if (n >= 3) {
    if (n % 2 === 1) middleValues = [sorted[Math.floor(n / 2)]];
    else middleValues = [sorted[n / 2 - 1], sorted[n / 2]];
  }
  return nums.map((v) => ({
    low: v === lowValue,
    high: v === highValue,
    middle: middleValues.includes(v) && v !== lowValue && v !== highValue,
  }));
}

// Computes full results for one finished (or in-progress) game.
function computeGameStats(game) {
  const { playerIds, rounds } = game;
  const n = playerIds.length;
  const totals = playerIds.map((_, i) => rounds.reduce((s, r) => s + (Number(r[i]) || 0), 0));
  const roundWins = playerIds.map(() => 0);
  const drinkCounts = playerIds.map(() => 0);
  rounds.forEach((round) => {
    const flags = getDrinkFlags(round);
    flags.forEach((f, i) => {
      if (f.low) roundWins[i] += 1;
      if (f.low || f.middle || f.high) drinkCounts[i] += 1;
    });
  });
  const minTotal = totals.length ? Math.min(...totals) : null;
  const maxTotal = totals.length ? Math.max(...totals) : null;
  const winnerIdx = totals.map((t, i) => (t === minTotal ? i : -1)).filter((i) => i >= 0);
  const loserIdx = totals.map((t, i) => (t === maxTotal ? i : -1)).filter((i) => i >= 0);
  const maxRoundWins = roundWins.length ? Math.max(...roundWins) : 0;
  const minRoundWins = roundWins.length ? Math.min(...roundWins) : 0;
  const maxDrinks = drinkCounts.length ? Math.max(...drinkCounts) : 0;
  const minDrinks = drinkCounts.length ? Math.min(...drinkCounts) : 0;
  const mostRoundsWonIdx = roundWins.map((v, i) => (v === maxRoundWins ? i : -1)).filter((i) => i >= 0);
  const leastRoundsWonIdx = roundWins.map((v, i) => (v === minRoundWins ? i : -1)).filter((i) => i >= 0);
  const mostDrinksIdx = drinkCounts.map((v, i) => (v === maxDrinks ? i : -1)).filter((i) => i >= 0);
  const leastDrinksIdx = drinkCounts.map((v, i) => (v === minDrinks ? i : -1)).filter((i) => i >= 0);
  return {
    totals, roundWins, drinkCounts, minTotal, maxTotal,
    winnerIdx, loserIdx, mostRoundsWonIdx, leastRoundsWonIdx, mostDrinksIdx, leastDrinksIdx,
    maxRoundWins, minRoundWins, maxDrinks, minDrinks,
  };
}

// Buckets finished games by month for the "games played over time" trend.
function monthlyGameCounts(games) {
  const map = {};
  games.forEach((g) => {
    const d = new Date(g.finishedAt || g.startedAt);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    const label = d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    if (!map[key]) map[key] = { key, label, count: 0 };
    map[key].count += 1;
  });
  return Object.values(map).sort((a, b) => (a.key > b.key ? 1 : -1));
}

const btnPrimary = {
  background: PALETTE.brass,
  border: "none",
  borderRadius: 10,
  padding: "14px",
  color: PALETTE.railDeep,
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
};
const btnSecondary = {
  background: "none",
  border: `1px solid rgba(242,239,230,0.25)`,
  color: PALETTE.cream,
  borderRadius: 10,
  padding: "12px",
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
};

export default function MexicanTrainFamilyApp() {
  const [loaded, setLoaded] = useState(false);
  const [trainRunning, setTrainRunning] = useState(false);
  const [view, setView] = useState("home"); // home (incl. dashboard) | pick | manage | game | recap | player

  // Switching views is just a re-render, not a real page navigation, so the
  // browser has no reason to reset scroll on its own — do it explicitly.
  useEffect(() => { window.scrollTo(0, 0); }, [view]);
  const [players, setPlayers] = useState([]); // {id,name,archived,createdAt}
  const [games, setGames] = useState([]); // finished games
  const [activeGame, setActiveGame] = useState(null); // in-progress game
  const [recapGameId, setRecapGameId] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  const [pickSelection, setPickSelection] = useState([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [manageNewName, setManageNewName] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // 'finish' | 'abandon' | null
  const [addPlayerStep, setAddPlayerStep] = useState("pick"); // 'pick' | 'confirm'
  const [addPlayerCandidateId, setAddPlayerCandidateId] = useState(null);
  const [addPlayerNewName, setAddPlayerNewName] = useState("");

  const saveTimers = useRef({});

  useEffect(() => {
    (async () => {
      let loadedPlayers = [];
      let loadedGames = [];
      let loadedActive = null;

      try {
        const { data, error } = await supabase.from("players").select("*").order("created_at", { ascending: true });
        if (!error && data) loadedPlayers = data.map(rowToPlayer);
      } catch (e) {}

      try {
        const { data, error } = await supabase.from("games").select("*").eq("status", "finished").order("finished_at", { ascending: true });
        if (!error && data) loadedGames = data.map(rowToGame);
      } catch (e) {}

      try {
        const { data, error } = await supabase.from("games").select("*").eq("status", "active").order("started_at", { ascending: false }).limit(1);
        if (!error && data && data.length > 0) loadedActive = rowToGame(data[0]);
      } catch (e) {}

      setPlayers(loadedPlayers);
      setGames(loadedGames);
      setActiveGame(loadedActive);
      setLoaded(true);
    })();
  }, []);

  // Debounced upsert of the active (in-progress) game row — used while scoring,
  // where rounds/title/drinking-mode change frequently and we don't want a
  // network call on every keystroke.
  function debouncedSaveActiveGame(game) {
    if (saveTimers.current.active) clearTimeout(saveTimers.current.active);
    saveTimers.current.active = setTimeout(async () => {
      try {
        if (game) await supabase.from("games").upsert(gameToRow(game, "active"));
      } catch (e) {}
    }, 350);
  }
  useEffect(() => { if (loaded && activeGame) debouncedSaveActiveGame(activeGame); }, [activeGame, loaded]);

  // Debounced persistence of reordered players — rapid up/down taps would
  // otherwise fire overlapping write batches that can land out of order and
  // corrupt the saved order; only the final settled order gets written.
  function debouncedSavePlayerOrder(orderedActive) {
    if (saveTimers.current.playerOrder) clearTimeout(saveTimers.current.playerOrder);
    saveTimers.current.playerOrder = setTimeout(() => {
      orderedActive.forEach((p) => {
        supabase.from("players").update({ created_at: p.createdAt }).eq("id", p.id).then(({ error }) => { if (error) console.error(error); });
      });
    }, 400);
  }

  function getPlayerName(id) {
    const p = players.find((pl) => pl.id === id);
    return p ? p.name : "Unknown";
  }

  // ---------- Player roster actions ----------
  function addPlayer(name, autoSelect) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const p = { id: uid(), name: trimmed, archived: false, createdAt: Date.now() };
    setPlayers((prev) => [...prev, p]);
    if (autoSelect) setPickSelection((prev) => [...prev, p.id]);
    supabase.from("players").insert({ id: p.id, name: p.name, archived: p.archived, created_at: p.createdAt }).then(({ error }) => { if (error) console.error(error); });
    return p.id;
  }
  function toggleArchive(id) {
    let nextVal = false;
    setPlayers((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      nextVal = !p.archived;
      return { ...p, archived: nextVal };
    }));
    supabase.from("players").update({ archived: nextVal }).eq("id", id).then(({ error }) => { if (error) console.error(error); });
  }
  function renamePlayer(id, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
    supabase.from("players").update({ name: trimmed }).eq("id", id).then(({ error }) => { if (error) console.error(error); });
  }
  function movePlayer(id, direction) {
    setPlayers((prev) => {
      const activeList = prev.filter((p) => !p.archived);
      const archivedList = prev.filter((p) => p.archived);
      const idx = activeList.findIndex((p) => p.id === id);
      const swapIdx = idx + direction;
      if (idx < 0 || swapIdx < 0 || swapIdx >= activeList.length) return prev;
      [activeList[idx], activeList[swapIdx]] = [activeList[swapIdx], activeList[idx]];
      const base = Date.now();
      const reordered = activeList.map((p, i) => ({ ...p, createdAt: base + i }));
      debouncedSavePlayerOrder(reordered);
      return [...reordered, ...archivedList];
    });
  }

  // ---------- Game lifecycle ----------
  function startGame() {
    if (pickSelection.length < 2) return;
    const g = {
      id: uid(),
      title: formatDateTime(Date.now()),
      playerIds: pickSelection,
      rounds: [],
      drinkingMode: false,
      startedAt: Date.now(),
      finishedAt: null,
    };
    setActiveGame(g);
    setView("game");
  }
  function addRound() {
    setActiveGame((prev) => ({ ...prev, rounds: [...prev.rounds, prev.playerIds.map(() => 0)] }));
  }
  function updateScore(roundIdx, playerIdx, val) {
    setActiveGame((prev) => {
      const rounds = prev.rounds.map((r) => [...r]);
      rounds[roundIdx][playerIdx] = val === "" ? "" : Number(val);
      return { ...prev, rounds };
    });
  }
  function deleteRound(roundIdx) {
    setActiveGame((prev) => ({ ...prev, rounds: prev.rounds.filter((_, i) => i !== roundIdx) }));
  }
  function toggleDrinkingMode() {
    setActiveGame((prev) => ({ ...prev, drinkingMode: !prev.drinkingMode }));
  }
  function saveTitle() {
    const trimmed = titleDraft.trim();
    setActiveGame((prev) => ({ ...prev, title: trimmed || prev.title }));
    setEditingTitle(false);
  }
  function finishGame() {
    if (saveTimers.current.active) clearTimeout(saveTimers.current.active);
    const finished = { ...activeGame, finishedAt: Date.now() };
    setGames((prev) => [...prev, finished]);
    setRecapGameId(finished.id);
    setActiveGame(null);
    setConfirmAction(null);
    setView("recap");
    supabase.from("games").upsert(gameToRow(finished, "finished")).then(({ error }) => { if (error) console.error(error); });
  }
  function abandonGame() {
    if (saveTimers.current.active) clearTimeout(saveTimers.current.active);
    const idToDelete = activeGame?.id;
    setActiveGame(null);
    setConfirmAction(null);
    setView("home");
    if (idToDelete) supabase.from("games").delete().eq("id", idToDelete).then(({ error }) => { if (error) console.error(error); });
  }

  // ---------- Dashboard aggregation ----------
  function computeDashboard() {
    const stats = {};
    players.forEach((p) => {
      stats[p.id] = { id: p.id, name: p.name, archived: p.archived, gamesPlayed: 0, gameWins: 0, gameLosses: 0, roundWins: 0, totalDrinks: 0, drinkingGamesPlayed: 0 };
    });
    games.forEach((g) => {
      const gs = computeGameStats(g);
      g.playerIds.forEach((pid, i) => {
        if (!stats[pid]) return;
        stats[pid].gamesPlayed += 1;
        stats[pid].roundWins += gs.roundWins[i];
        if (g.drinkingMode) {
          stats[pid].totalDrinks += gs.drinkCounts[i];
          stats[pid].drinkingGamesPlayed += 1;
        }
        if (gs.winnerIdx.includes(i)) stats[pid].gameWins += 1;
        if (gs.loserIdx.includes(i)) stats[pid].gameLosses += 1;
      });
    });
    return Object.values(stats);
  }

  if (!loaded) return <div style={{ minHeight: "100vh", background: PALETTE.rail }} />;

  const pageStyle = {
    minHeight: "100vh",
    background: `linear-gradient(180deg, ${PALETTE.railDeep} 0%, ${PALETTE.rail} 100%)`,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    color: PALETTE.cream,
    padding: "calc(24px + env(safe-area-inset-top)) 20px 40px",
  };

  function BackHeader({ title, onBack, right }) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: PALETTE.cream, cursor: "pointer", padding: 4 }}>
            <ChevronLeft size={22} />
          </button>
          <h1 style={{ fontSize: 20, margin: 0, fontWeight: 700 }}>{title}</h1>
        </div>
        {right}
      </div>
    );
  }

  function TrainEasterEgg() {
    if (!trainRunning) return null;
    return (
      <>
        <style>{`
          @keyframes trainDriveAcross {
            from { transform: translateX(calc(100vw + 260px)); }
            to { transform: translateX(-260px); }
          }
        `}</style>
        <img
          src="/easter-egg-train.png"
          alt=""
          width={200}
          height={84}
          style={{
            position: "fixed",
            bottom: 24,
            left: 0,
            zIndex: 9999,
            pointerEvents: "none",
            animation: "trainDriveAcross 4s linear forwards",
          }}
          onAnimationEnd={() => setTrainRunning(false)}
        />
      </>
    );
  }

  // ---------- HOME (+ DASHBOARD) ----------
  if (view === "home") {
    const allStats = computeDashboard();
    const stats = [...allStats].sort((a, b) => b.gameWins - a.gameWins);
    const played = allStats.filter((s) => s.gamesPlayed > 0);
    const winsData = [...played].sort((a, b) => b.gameWins - a.gameWins).map((s) => ({ name: s.name, value: s.gameWins }));
    const drinksData = [...played].sort((a, b) => b.totalDrinks - a.totalDrinks).map((s) => ({ name: s.name, value: s.totalDrinks }));
    const rateData = [...played]
      .map((s) => ({ name: s.name, value: Math.round((s.gameWins / s.gamesPlayed) * 100) }))
      .sort((a, b) => b.value - a.value);
    const trend = monthlyGameCounts(games);
    const historyList = [...games].sort((a, b) => b.finishedAt - a.finishedAt);

    const maxWins = played.length ? Math.max(...played.map((s) => s.gameWins)) : 0;
    const maxLosses = played.length ? Math.max(...played.map((s) => s.gameLosses)) : 0;
    const maxDrinks = played.length ? Math.max(...played.map((s) => s.totalDrinks)) : 0;
    const bigWinnerIds = new Set(maxWins > 0 ? played.filter((s) => s.gameWins === maxWins).map((s) => s.id) : []);
    const bigLoserIds = new Set(maxLosses > 0 ? played.filter((s) => s.gameLosses === maxLosses).map((s) => s.id) : []);
    const bigDrinkerIds = new Set(maxDrinks > 0 ? played.filter((s) => s.totalDrinks === maxDrinks).map((s) => s.id) : []);

    const cardStyle = { background: "rgba(242,239,230,0.05)", border: `1px solid rgba(242,239,230,0.1)`, borderRadius: 12, padding: "16px 12px 8px", marginBottom: 18 };
    const cardTitleStyle = { fontSize: 13, fontWeight: 600, color: PALETTE.cream, marginBottom: 10, paddingLeft: 8 };
    const axisStyle = { fontSize: 11, fill: PALETTE.slate };

    function HBarChart({ data, color }) {
      if (data.length === 0) return <div style={{ color: PALETTE.slate, fontSize: 13, padding: "0 8px 12px" }}>No data yet.</div>;
      const height = Math.max(60, data.length * 34);
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ left: 6, right: 16, top: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" tick={axisStyle} width={80} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: PALETTE.railDeep, border: `1px solid rgba(242,239,230,0.2)`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: PALETTE.cream }} cursor={{ fill: "rgba(242,239,230,0.05)" }} />
            <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} barSize={16} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
            <img
              src="/icon.png"
              alt=""
              width={40}
              height={40}
              style={{ borderRadius: 10, display: "block", cursor: "pointer" }}
              onClick={() => setTrainRunning(true)}
            />
            <div>
              <div style={{ fontSize: 11, letterSpacing: "3px", color: PALETTE.brassLight, textTransform: "uppercase" }}>All Aboard</div>
              <h1 style={{ fontSize: 28, margin: 0, fontWeight: 700 }}>Mexican Train</h1>
            </div>
          </div>

          <TrainEasterEgg />

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
            {activeGame && (
              <button onClick={() => setView("game")} style={{ ...btnPrimary, display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
                Resume Game: {activeGame.title}
              </button>
            )}
            <button
              onClick={() => { setPickSelection([]); setView("pick"); }}
              style={activeGame ? btnSecondary : { ...btnPrimary, display: "flex", justifyContent: "center" }}
            >
              + Start New Game
            </button>
          </div>

          {games.length === 0 ? (
            <div style={{ color: PALETTE.slate, fontSize: 14, marginBottom: 20 }}>No games played yet.</div>
          ) : (
            <>
              <div style={cardStyle}>
                <div style={cardTitleStyle}>Games played over time</div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={trend} margin={{ left: -16, right: 16, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(242,239,230,0.08)" vertical={false} />
                    <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={axisStyle} axisLine={false} tickLine={false} width={24} />
                    <Tooltip contentStyle={{ background: PALETTE.railDeep, border: `1px solid rgba(242,239,230,0.2)`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: PALETTE.cream }} />
                    <Line type="monotone" dataKey="count" stroke={PALETTE.brassLight} strokeWidth={2} dot={{ r: 3, fill: PALETTE.brassLight }} name="Games" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={cardStyle}>
                <div style={cardTitleStyle}>Game wins by player</div>
                <HBarChart data={winsData} color={PALETTE.green} />
              </div>

              <div style={cardStyle}>
                <div style={cardTitleStyle}>Win rate %</div>
                <HBarChart data={rateData} color={PALETTE.blue} />
              </div>

              <div style={cardStyle}>
                <div style={cardTitleStyle}>Total drinks by player</div>
                <HBarChart data={drinksData} color={PALETTE.purple} />
              </div>
            </>
          )}

          <div style={{ fontSize: 12, color: PALETTE.slate, marginBottom: 8, marginTop: 8, textTransform: "uppercase", letterSpacing: 1 }}>Players</div>
          {stats.length === 0 && <div style={{ color: PALETTE.slate, fontSize: 14, marginBottom: 20 }}>No players yet.</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24 }}>
            {stats.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSelectedPlayerId(s.id); setView("player"); }}
                style={{ position: "relative", textAlign: "left", background: "rgba(242,239,230,0.05)", border: `1px solid rgba(242,239,230,0.12)`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", color: PALETTE.cream }}
              >
                {(bigWinnerIds.has(s.id) || bigLoserIds.has(s.id) || bigDrinkerIds.has(s.id)) && (
                  <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 2 }}>
                    {bigWinnerIds.has(s.id) && <img src="/badge-winner.png" alt="Big Winner" width={40} height={40} style={{ display: "block" }} />}
                    {bigLoserIds.has(s.id) && <img src="/badge-loser.png" alt="Big Loser" width={40} height={40} style={{ display: "block" }} />}
                    {bigDrinkerIds.has(s.id) && <img src="/badge-drinker.png" alt="Big Drinker" width={40} height={40} style={{ display: "block" }} />}
                  </div>
                )}
                <div style={{ paddingRight: 46 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{s.name} {s.archived && <span style={{ fontSize: 11, color: PALETTE.slate }}>(archived)</span>}</div>
                  <div style={{ fontSize: 12, color: PALETTE.slate, marginTop: 2 }}>{s.gamesPlayed} games</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 700, color: PALETTE.green, lineHeight: 1.15 }}>{s.gameWins}</div>
                    <div style={{ fontSize: 10, color: PALETTE.slate }}>wins</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 700, color: PALETTE.red, lineHeight: 1.15 }}>{s.gameLosses}</div>
                    <div style={{ fontSize: 10, color: PALETTE.slate }}>losses</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 700, color: PALETTE.cream, lineHeight: 1.15 }}>{s.roundWins}</div>
                    <div style={{ fontSize: 10, color: PALETTE.slate }}>round wins</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 700, color: PALETTE.purple, lineHeight: 1.15 }}>{s.totalDrinks}</div>
                    <div style={{ fontSize: 10, color: PALETTE.slate }}>drinks</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div style={{ fontSize: 12, color: PALETTE.slate, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Game history</div>
          {historyList.length === 0 && <div style={{ color: PALETTE.slate, fontSize: 14 }}>No games yet.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {historyList.map((g) => {
              const gs = computeGameStats(g);
              const winnerNames = gs.winnerIdx.map((i) => getPlayerName(g.playerIds[i])).join(", ");
              return (
                <button
                  key={g.id}
                  onClick={() => { setRecapGameId(g.id); setView("recap"); }}
                  style={{ textAlign: "left", background: "rgba(242,239,230,0.04)", border: `1px solid rgba(242,239,230,0.1)`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", color: PALETTE.cream }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{g.title}</div>
                    <div style={{ fontSize: 11, color: PALETTE.slate }}>{formatDateTime(g.finishedAt)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: PALETTE.slate, marginTop: 4 }}>
                    {g.playerIds.map((pid) => getPlayerName(pid)).join(", ")}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4, color: PALETTE.green, fontWeight: 600 }}>
                    Won by {winnerNames}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ---------- PLAYER PICKER ----------
  if (view === "pick") {
    const active = players.filter((p) => !p.archived);
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <BackHeader title="Who's playing?" onBack={() => setView("home")} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {active.map((p) => {
              const selected = pickSelection.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => setPickSelection((prev) => selected ? prev.filter((id) => id !== p.id) : [...prev, p.id])}
                  style={{
                    padding: "10px 26px 10px 8px",
                    borderRadius: 999,
                    border: `1px solid ${selected ? PALETTE.brass : "rgba(242,239,230,0.25)"}`,
                    background: selected ? "rgba(192,138,62,0.2)" : "rgba(242,239,230,0.05)",
                    color: selected ? PALETTE.brassLight : PALETTE.cream,
                    fontSize: 14,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Check size={13} style={{ visibility: selected ? "visible" : "hidden", flexShrink: 0 }} />
                  <span>{p.name}</span>
                </button>
              );
            })}
            {active.length === 0 && <div style={{ color: PALETTE.slate, fontSize: 14 }}>No players yet — add one below.</div>}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <input
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { addPlayer(newPlayerName, true); setNewPlayerName(""); } }}
              placeholder="Add a new player"
              style={{ flex: 1, background: "rgba(242,239,230,0.06)", border: `1px solid rgba(242,239,230,0.2)`, borderRadius: 8, padding: "10px 12px", color: PALETTE.cream, fontSize: 14 }}
            />
            <button
              onClick={() => { addPlayer(newPlayerName, true); setNewPlayerName(""); }}
              style={{ ...btnSecondary, padding: "0 16px" }}
            >
              <Plus size={16} />
            </button>
          </div>

          <button onClick={() => setView("manage")} style={{ background: "none", border: "none", color: PALETTE.slate, fontSize: 13, textDecoration: "underline", cursor: "pointer", marginBottom: 20, display: "block" }}>
            Manage players
          </button>

          <button onClick={startGame} disabled={pickSelection.length < 2} style={{ ...btnPrimary, width: "100%", opacity: pickSelection.length < 2 ? 0.5 : 1 }}>
            Start Game ({pickSelection.length} players)
          </button>
        </div>
      </div>
    );
  }

  // ---------- MANAGE PLAYERS ----------
  if (view === "manage") {
    const active = players.filter((p) => !p.archived);
    const archived = players.filter((p) => p.archived);
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <BackHeader title="Manage Players" onBack={() => setView("pick")} />

          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            <input
              value={manageNewName}
              onChange={(e) => setManageNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { addPlayer(manageNewName, false); setManageNewName(""); } }}
              placeholder="Add a new player"
              style={{ flex: 1, background: "rgba(242,239,230,0.06)", border: `1px solid rgba(242,239,230,0.2)`, borderRadius: 8, padding: "10px 12px", color: PALETTE.cream, fontSize: 14 }}
            />
            <button onClick={() => { addPlayer(manageNewName, false); setManageNewName(""); }} style={{ ...btnSecondary, padding: "0 16px" }}>
              <Plus size={16} />
            </button>
          </div>

          <div style={{ fontSize: 12, color: PALETTE.slate, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Active</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {active.map((p, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(242,239,230,0.05)", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <button onClick={() => movePlayer(p.id, -1)} disabled={i === 0} style={{ background: "none", border: "none", color: PALETTE.slate, cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.3 : 1, padding: 2, display: "flex" }}>
                    <ChevronUp size={14} />
                  </button>
                  <button onClick={() => movePlayer(p.id, 1)} disabled={i === active.length - 1} style={{ background: "none", border: "none", color: PALETTE.slate, cursor: i === active.length - 1 ? "default" : "pointer", opacity: i === active.length - 1 ? 0.3 : 1, padding: 2, display: "flex" }}>
                    <ChevronDown size={14} />
                  </button>
                </div>
                {renamingId === p.id ? (
                  <input
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => { renamePlayer(p.id, renameValue); setRenamingId(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { renamePlayer(p.id, renameValue); setRenamingId(null); } }}
                    style={{ flex: 1, background: "rgba(242,239,230,0.1)", border: `1px solid ${PALETTE.brass}`, borderRadius: 6, padding: "4px 8px", color: PALETTE.cream, fontSize: 14 }}
                  />
                ) : (
                  <div style={{ flex: 1, fontSize: 14 }}>{p.name}</div>
                )}
                <button onClick={() => { setRenamingId(p.id); setRenameValue(p.name); }} style={{ background: "none", border: "none", color: PALETTE.slate, cursor: "pointer" }}>
                  <Pencil size={14} />
                </button>
                <button onClick={() => toggleArchive(p.id)} style={{ background: "none", border: "none", color: PALETTE.slate, cursor: "pointer" }}>
                  <Archive size={14} />
                </button>
              </div>
            ))}
          </div>

          {archived.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: PALETTE.slate, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Archived</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {archived.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(242,239,230,0.03)", borderRadius: 8, padding: "10px 12px", opacity: 0.6 }}>
                    <div style={{ flex: 1, fontSize: 14 }}>{p.name}</div>
                    <button onClick={() => toggleArchive(p.id)} style={{ background: "none", border: "none", color: PALETTE.brassLight, cursor: "pointer" }}>
                      <ArchiveRestore size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---------- ADD PLAYER MID-GAME ----------
  if (view === "addPlayer" && activeGame) {
    const eligible = players.filter((p) => !p.archived && !activeGame.playerIds.includes(p.id));

    if (addPlayerStep === "pick") {
      function createAndSelect() {
        const id = addPlayer(addPlayerNewName, false);
        if (id) { setAddPlayerCandidateId(id); setAddPlayerStep("confirm"); setAddPlayerNewName(""); }
      }
      return (
        <div style={pageStyle}>
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <BackHeader title="Add Player" onBack={() => setView("game")} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {eligible.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setAddPlayerCandidateId(p.id); setAddPlayerStep("confirm"); }}
                  style={{ padding: "10px 16px", borderRadius: 999, border: `1px solid rgba(242,239,230,0.25)`, background: "rgba(242,239,230,0.05)", color: PALETTE.cream, fontSize: 14, cursor: "pointer" }}
                >
                  {p.name}
                </button>
              ))}
              {eligible.length === 0 && <div style={{ color: PALETTE.slate, fontSize: 14 }}>Everyone active is already in this game.</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={addPlayerNewName}
                onChange={(e) => setAddPlayerNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createAndSelect(); }}
                placeholder="Add a new player"
                style={{ flex: 1, background: "rgba(242,239,230,0.06)", border: `1px solid rgba(242,239,230,0.2)`, borderRadius: 8, padding: "10px 12px", color: PALETTE.cream, fontSize: 14 }}
              />
              <button onClick={createAndSelect} style={{ ...btnSecondary, padding: "0 16px" }}>
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ---- confirm step ----
    const candidate = players.find((p) => p.id === addPlayerCandidateId);
    const missedRounds = activeGame.rounds.map((round, idx) => ({
      idx,
      high: round.length ? Math.max(...round.map((s) => Number(s) || 0)) : 0,
    }));

    function confirmAddPlayer() {
      const backfilled = activeGame.rounds.map((round) => {
        const high = round.length ? Math.max(...round.map((s) => Number(s) || 0)) : 0;
        return [...round, high];
      });
      setActiveGame((prev) => ({ ...prev, playerIds: [...prev.playerIds, addPlayerCandidateId], rounds: backfilled }));
      setView("game");
    }

    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <BackHeader title="Add Player" onBack={() => setAddPlayerStep("pick")} />
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>
            Add {candidate?.name} to this game?
          </div>
          {missedRounds.length === 0 ? (
            <div style={{ color: PALETTE.slate, fontSize: 14, marginBottom: 20 }}>
              No rounds played yet — {candidate?.name} will start even with everyone else.
            </div>
          ) : (
            <>
              <div style={{ color: PALETTE.slate, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
                {candidate?.name} missed {missedRounds.length} round{missedRounds.length === 1 ? "" : "s"}. They'll be backfilled with that round's highest (worst) score{activeGame.drinkingMode ? ", and will pick up the drink tag for those rounds since it ties the existing high" : ""}:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {missedRounds.map(({ idx, high }) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", background: "rgba(242,239,230,0.05)", borderRadius: 8, padding: "10px 12px", fontSize: 14 }}>
                    <span style={{ color: PALETTE.slate }}>Round {idx + 1}</span>
                    <span style={{ fontWeight: 700 }}>{high}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setView("game")} style={{ ...btnSecondary, flex: 1 }}>Cancel</button>
            <button onClick={confirmAddPlayer} style={{ ...btnPrimary, flex: 1 }}>Confirm</button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- GAME ----------
  if (view === "game" && activeGame) {
    const totals = activeGame.playerIds.map((_, i) => activeGame.rounds.reduce((s, r) => s + (Number(r[i]) || 0), 0));
    const minTotal = totals.length ? Math.min(...totals) : null;
    const drinkCounts = activeGame.playerIds.map(() => 0);
    activeGame.rounds.forEach((round) => {
      getDrinkFlags(round).forEach((f, i) => { if (f.low || f.middle || f.high) drinkCounts[i] += 1; });
    });

    return (
      <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, ${PALETTE.railDeep} 0%, ${PALETTE.rail} 100%)`, fontFamily: "'Helvetica Neue', Arial, sans-serif", color: PALETTE.cream, paddingBottom: 24 }}>
        <TrainEasterEgg />
        {/* Compact header */}
        <div style={{ padding: "calc(20px + env(safe-area-inset-top)) 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid rgba(242,239,230,0.12)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <img src="/icon.png" alt="" width={30} height={30} style={{ borderRadius: 7, display: "block", flexShrink: 0 }} />
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); }}
                style={{ background: "rgba(242,239,230,0.1)", border: `1px solid ${PALETTE.brass}`, borderRadius: 6, padding: "4px 8px", color: PALETTE.cream, fontSize: 14, flex: 1, minWidth: 0 }}
              />
            ) : (
              <div
                onClick={() => { setEditingTitle(true); setTitleDraft(activeGame.title); }}
                style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}
              >
                {activeGame.title}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button
              onClick={toggleDrinkingMode}
              aria-pressed={activeGame.drinkingMode}
              style={{ background: activeGame.drinkingMode ? "rgba(192,138,62,0.25)" : "none", border: `1px solid ${activeGame.drinkingMode ? PALETTE.brass : "rgba(242,239,230,0.2)"}`, borderRadius: 8, padding: 8, color: activeGame.drinkingMode ? PALETTE.brassLight : PALETTE.cream, cursor: "pointer", display: "flex" }}
            >
              <Wine size={16} />
            </button>
            <button onClick={() => setSheetOpen(true)} style={{ background: "none", border: "none", color: PALETTE.cream, cursor: "pointer", padding: 8 }}>
              <MoreVertical size={18} />
            </button>
          </div>
        </div>

        {/* Standings, ranked lowest to highest */}
        <div style={{ padding: "16px 20px", display: "flex", gap: 10, overflowX: "auto" }}>
          {activeGame.playerIds
            .map((pid, i) => ({ pid, i, total: totals[i], name: getPlayerName(pid) }))
            .sort((a, b) => a.total - b.total)
            .map((p, rank) => {
              const isLeader = totals.length > 0 && p.total === minTotal && activeGame.rounds.length > 0;
              return (
                <div key={p.pid} style={{ minWidth: 92, background: isLeader ? "rgba(192,138,62,0.15)" : "rgba(242,239,230,0.05)", border: `1px solid ${isLeader ? PALETTE.brass : "rgba(242,239,230,0.12)"}`, borderRadius: 10, padding: "10px 12px", flexShrink: 0, position: "relative" }}>
                  <div style={{ position: "absolute", top: 6, right: 8, fontSize: 10, color: PALETTE.slate, fontWeight: 600 }}>#{rank + 1}</div>
                  <div style={{ fontSize: 12, color: PALETTE.slate, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 14 }}>
                    {isLeader && <Trophy size={11} color={PALETTE.brassLight} />} {p.name}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{p.total}</div>
                  {activeGame.drinkingMode && (
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {drinkCounts[p.i] === 0 ? (
                        <span style={{ fontSize: 10, color: PALETTE.slate }}>—</span>
                      ) : drinkCounts[p.i] <= 12 ? (
                        Array.from({ length: drinkCounts[p.i] }).map((_, d) => (
                          <span key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: PALETTE.purple, display: "inline-block" }} />
                        ))
                      ) : (
                        <>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: PALETTE.purple, display: "inline-block" }} />
                          <span style={{ fontSize: 10, color: PALETTE.purple, fontWeight: 700 }}>&times;{drinkCounts[p.i]}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {/* Score table */}
        <div style={{ padding: "0 20px" }}>
          {activeGame.rounds.length === 0 ? (
            <div style={{ textAlign: "center", color: PALETTE.slate, padding: "40px 20px", border: `1px dashed rgba(242,239,230,0.15)`, borderRadius: 12, fontSize: 14 }}>
              No rounds yet. Add a round after each hand and enter each player's leftover pip count.
            </div>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid rgba(242,239,230,0.08)`, borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: activeGame.playerIds.length * 90 + 60 }}>
                <thead>
                  <tr>
                    <th
                      onClick={() => setTrainRunning(true)}
                      style={{ textAlign: "left", padding: "6px 4px", fontSize: 11, color: PALETTE.slate, fontWeight: 500, position: "sticky", left: 0, background: PALETTE.rail, zIndex: 2, boxShadow: `1px 0 0 rgba(242,239,230,0.15)`, cursor: "pointer" }}
                    >
                      Round
                    </th>
                    {activeGame.playerIds.map((pid, i) => (
                      <th key={pid} style={{ textAlign: "center", padding: "6px 4px", fontSize: 12, color: PALETTE.cream, fontWeight: 600, minWidth: 78, background: PALETTE.rail }}>
                        {getPlayerName(pid)}
                      </th>
                    ))}
                    <th style={{ width: 30, background: PALETTE.rail }}></th>
                  </tr>
                </thead>
                <tbody>
                  {activeGame.rounds.map((round, rIdx) => {
                    const roundFlags = activeGame.drinkingMode ? getDrinkFlags(round) : null;
                    return (
                      <tr key={rIdx}>
                        <td style={{ padding: "6px 4px", fontSize: 13, color: PALETTE.slate, position: "sticky", left: 0, background: PALETTE.rail, zIndex: 1, boxShadow: `1px 0 0 rgba(242,239,230,0.15)` }}>{rIdx + 1}</td>
                        {round.map((score, pIdx) => {
                          const flags = roundFlags ? roundFlags[pIdx] : null;
                          const tagColor = flags?.low ? PALETTE.green : flags?.high ? PALETTE.red : flags?.middle ? PALETTE.brass : null;
                          const tagLabel = flags?.low ? "L" : flags?.high ? "H" : flags?.middle ? "M" : null;
                          return (
                            <td key={pIdx} style={{ padding: "4px", position: "relative" }}>
                              {tagColor && <div style={{ position: "absolute", top: "50%", right: 10, transform: "translateY(-50%)", fontSize: 9, fontWeight: 700, color: tagColor, zIndex: 1, pointerEvents: "none" }}>{tagLabel}</div>}
                              <input
                                type="number"
                                inputMode="numeric"
                                value={score === 0 ? 0 : score}
                                onChange={(e) => updateScore(rIdx, pIdx, e.target.value)}
                                onFocus={(e) => e.target.select()}
                                style={{ width: "100%", boxSizing: "border-box", background: tagColor ? `${tagColor}22` : "rgba(242,239,230,0.06)", border: tagColor ? `2px solid ${tagColor}` : `1px solid rgba(242,239,230,0.15)`, borderRadius: 6, padding: "8px 6px", color: PALETTE.cream, fontSize: 14, textAlign: "center", outline: "none" }}
                              />
                            </td>
                          );
                        })}
                        <td>
                          <button onClick={() => deleteRound(rIdx)} style={{ background: "none", border: "none", color: PALETTE.slate, cursor: "pointer", padding: 4 }}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td style={{ padding: "8px 4px", fontSize: 11, color: PALETTE.slate, position: "sticky", left: 0, background: PALETTE.rail, zIndex: 1, boxShadow: `1px 0 0 rgba(242,239,230,0.15), 0 -1px 0 rgba(242,239,230,0.15)` }} />
                    {activeGame.playerIds.map((pid) => (
                      <td key={pid} style={{ textAlign: "center", padding: "8px 4px", fontSize: 12, color: PALETTE.cream, fontWeight: 600, borderTop: `1px solid rgba(242,239,230,0.15)` }}>
                        {getPlayerName(pid)}
                      </td>
                    ))}
                    <td style={{ borderTop: `1px solid rgba(242,239,230,0.15)` }} />
                  </tr>
                  <tr>
                    <td style={{ padding: "10px 4px", fontSize: 13, color: PALETTE.brassLight, fontWeight: 700, position: "sticky", left: 0, background: PALETTE.rail, zIndex: 1, boxShadow: `1px 0 0 rgba(242,239,230,0.15)` }}>Total</td>
                    {totals.map((t, i) => (
                      <td key={i} style={{ textAlign: "center", fontSize: 15, fontWeight: 700, color: t === minTotal ? PALETTE.brassLight : PALETTE.cream, borderTop: `1px solid rgba(242,239,230,0.15)`, paddingTop: 10 }}>{t}</td>
                    ))}
                    <td style={{ borderTop: `1px solid rgba(242,239,230,0.15)` }}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <button onClick={addRound} style={{ width: "100%", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, ...btnPrimary }}>
            <Plus size={18} /> Add round
          </button>
        </div>

        {/* Menu dropdown */}
        {sheetOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setSheetOpen(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ position: "absolute", top: 60, right: 20, minWidth: 230, background: PALETTE.rail, border: `1px solid rgba(242,239,230,0.15)`, borderRadius: 12, boxShadow: "0 12px 28px rgba(0,0,0,0.45)", overflow: "hidden" }}
            >
              {[
                { label: "Home", icon: <Home size={17} />, onClick: () => { setSheetOpen(false); setView("home"); } },
                { label: "Add Player to Game", icon: <UserPlus size={17} />, onClick: () => { setSheetOpen(false); setAddPlayerStep("pick"); setAddPlayerCandidateId(null); setAddPlayerNewName(""); setView("addPlayer"); } },
                { label: "Abandon Game", icon: <Skull size={17} />, onClick: () => { setSheetOpen(false); setConfirmAction("abandon"); }, color: PALETTE.red },
                { label: "Finish Game", icon: <Check size={17} />, onClick: () => { setSheetOpen(false); setConfirmAction("finish"); }, color: PALETTE.brassLight },
              ].map((item, i, arr) => (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "16px 18px",
                    background: "none",
                    border: "none",
                    borderBottom: i < arr.length - 1 ? `1px solid rgba(242,239,230,0.08)` : "none",
                    color: item.color || PALETTE.cream,
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {item.icon} {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Confirm modal */}
        {confirmAction && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 11, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div style={{ background: PALETTE.rail, border: `1px solid rgba(242,239,230,0.15)`, borderRadius: 12, padding: 20, maxWidth: 340, width: "100%" }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
                {confirmAction === "finish" ? "Finish this game?" : "Abandon this game?"}
              </div>
              <div style={{ fontSize: 13, color: PALETTE.slate, marginBottom: 18 }}>
                {confirmAction === "finish" ? "This locks in the results and saves it to your family's game history." : "This discards the game completely. It won't be saved anywhere. This can't be undone."}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setConfirmAction(null)} style={{ ...btnSecondary, flex: 1 }}>Cancel</button>
                <button
                  onClick={() => (confirmAction === "finish" ? finishGame() : abandonGame())}
                  style={{ ...btnPrimary, flex: 1, background: confirmAction === "abandon" ? PALETTE.red : PALETTE.brass, color: PALETTE.railDeep }}
                >
                  {confirmAction === "finish" ? "Finish" : "Abandon"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- RECAP ----------
  if (view === "recap") {
    const game = games.find((g) => g.id === recapGameId);
    if (!game) { setView("home"); return null; }
    const gs = computeGameStats(game);
    const names = (idxArr) => idxArr.map((i) => getPlayerName(game.playerIds[i])).join(", ");

    const Row = ({ label, value, color }) => (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: `1px solid rgba(242,239,230,0.1)` }}>
        <div style={{ fontSize: 13, color: PALETTE.slate }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: color || PALETTE.cream, textAlign: "right" }}>{value}</div>
      </div>
    );

    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <Trophy size={32} color={PALETTE.brassLight} />
            <h1 style={{ fontSize: 22, margin: "8px 0 2px" }}>{game.title}</h1>
            <div style={{ fontSize: 12, color: PALETTE.slate }}>{formatDateTime(game.finishedAt)}</div>
          </div>

          <Row label="Winner" value={names(gs.winnerIdx)} color={PALETTE.green} />
          <Row label="Last place" value={names(gs.loserIdx)} color={PALETTE.red} />
          <Row label="Most rounds won" value={`${names(gs.mostRoundsWonIdx)} (${gs.maxRoundWins})`} />
          <Row label="Least rounds won" value={`${names(gs.leastRoundsWonIdx)} (${gs.minRoundWins})`} />
          <Row label="Most drinks" value={`${names(gs.mostDrinksIdx)} (${gs.maxDrinks})`} color={PALETTE.purple} />
          <Row label="Least drinks" value={`${names(gs.leastDrinksIdx)} (${gs.minDrinks})`} color={PALETTE.purpleLight} />

          <div style={{ fontSize: 12, color: PALETTE.slate, textAlign: "center", marginTop: 14 }}>
            {game.drinkingMode
              ? "Drinking mode was on — drinks were tracked for this game."
              : "Drinking mode was off — drinks were not tracked for this game."}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
            <button onClick={() => setView("home")} style={{ ...btnPrimary }}>Back to Home</button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- PLAYER DETAIL ----------
  if (view === "player") {
    const allStats = computeDashboard();
    const stats = allStats.find((s) => s.id === selectedPlayerId);
    if (!stats) { setView("home"); return null; }
    const recent = games.filter((g) => g.playerIds.includes(selectedPlayerId)).sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 10);
    const winRate = stats.gamesPlayed ? Math.round((stats.gameWins / stats.gamesPlayed) * 100) : 0;
    const drinksPerGame = stats.drinkingGamesPlayed ? (stats.totalDrinks / stats.drinkingGamesPlayed).toFixed(1) : "0.0";

    const played = allStats.filter((s) => s.gamesPlayed > 0);
    const maxWins = played.length ? Math.max(...played.map((s) => s.gameWins)) : 0;
    const maxLosses = played.length ? Math.max(...played.map((s) => s.gameLosses)) : 0;
    const maxDrinks = played.length ? Math.max(...played.map((s) => s.totalDrinks)) : 0;
    const badges = [
      maxWins > 0 && stats.gameWins === maxWins ? { src: "/badge-winner.png", alt: "Big Winner" } : null,
      maxLosses > 0 && stats.gameLosses === maxLosses ? { src: "/badge-loser.png", alt: "Big Loser" } : null,
      maxDrinks > 0 && stats.totalDrinks === maxDrinks ? { src: "/badge-drinker.png", alt: "Big Drinker" } : null,
    ].filter(Boolean);

    const Stat = ({ label, value }) => (
      <div style={{ background: "rgba(242,239,230,0.05)", border: `1px solid rgba(242,239,230,0.1)`, borderRadius: 10, padding: "12px", flex: "1 1 44%" }}>
        <div style={{ fontSize: 11, color: PALETTE.slate, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
      </div>
    );

    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <BackHeader title={stats.name} onBack={() => setView("home")} />
          {badges.length > 0 && (
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              {badges.map((b) => (
                <img key={b.src} src={b.src} alt={b.alt} width={100} height={100} style={{ display: "block" }} />
              ))}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
            <Stat label="Games played" value={stats.gamesPlayed} />
            <Stat label="Game wins" value={`${stats.gameWins} (${winRate}%)`} />
            <Stat label="Game losses" value={stats.gameLosses} />
            <Stat label="Round wins" value={stats.roundWins} />
            <Stat label="Total drinks" value={stats.totalDrinks} />
            <Stat label="Drinks / game" value={drinksPerGame} />
          </div>

          <div style={{ fontSize: 12, color: PALETTE.slate, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Recent games</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recent.length === 0 && <div style={{ color: PALETTE.slate, fontSize: 13 }}>No games yet.</div>}
            {recent.map((g) => {
              const gs = computeGameStats(g);
              const idx = g.playerIds.indexOf(selectedPlayerId);
              const won = gs.winnerIdx.includes(idx);
              const lost = gs.loserIdx.includes(idx);
              return (
                <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(242,239,230,0.04)", borderRadius: 8, padding: "10px 12px" }}>
                  <div>
                    <div style={{ fontSize: 13 }}>{g.title}</div>
                    <div style={{ fontSize: 11, color: PALETTE.slate }}>{formatDateTime(g.finishedAt)}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: won ? PALETTE.green : lost ? PALETTE.red : PALETTE.slate }}>
                    {won ? "Won" : lost ? "Last" : gs.totals[idx]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
