import { useState, useRef, useEffect } from "react";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const FORMAT_SYSTEM = `You are a script FORMATTER only. You do NOT write, embellish, add jokes, add dialogue, or create content. You take the user's exact words and reformat them into standard animated short screenplay format.

RULES:

- NEVER add dialogue the user didn't write
- NEVER add jokes or punch up lines
- NEVER add new scenes or action the user didn't describe
- NEVER change the wording of dialogue — preserve it EXACTLY as written
- You MAY fix obvious typos if the intent is clear
- You MAY add minimal stage direction only where clearly implied
- You MAY infer scene headers (INT./EXT.) from context

FORMAT:

- Scene locations: ALL CAPS, preceded by INT. or EXT.
- Character names: ALL CAPS, centered, on own line before dialogue
- Dialogue: Normal case below character name
- Parenthetical direction: (in parentheses) between character name and dialogue
- Action/description: Normal case
- Transitions: [SMASH CUT TO:], [CUT TO:], [CUTAWAY:] etc.
- [BEAT] for pauses

Output ONLY the formatted script. No commentary.`;

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Project {
  id: string;
  title: string;
  updatedAt: number;
  roomMessages: Message[];
  formatInput: string;
  formattedScript: string;
  preproInput: string;
  preproOutput: string;
  checkedAssets: string[];
}

export default function ScriptForge() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>("");
  const [isInitialized, setIsInitialized] = useState(false);

  const [mode, setMode] = useState<"hub" | "room" | "format" | "prepro">("hub");

  // Global Series Hub state
  const [seriesBible, setSeriesBible] = useState("");
  const [seasonArc, setSeasonArc] = useState("");
  const [assetInventory, setAssetInventory] = useState("");

  // Writers Room state
  const [roomMessages, setRoomMessages] = useState<Message[]>([]);
  const [roomInput, setRoomInput] = useState("");
  const [roomLoading, setRoomLoading] = useState(false);
  const roomEndRef = useRef<HTMLDivElement>(null);

  // Format state
  const [formatInput, setFormatInput] = useState("");
  const [formattedScript, setFormattedScript] = useState("");
  const [formatLoading, setFormatLoading] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [formatError, setFormatError] = useState("");

  // Pre-Pro state
  const [preproInput, setPreproInput] = useState("");
  const [preproOutput, setPreproOutput] = useState("");
  const [preproLoading, setPreproLoading] = useState(false);
  const [preproError, setPreproError] = useState("");
  const [checkedAssets, setCheckedAssets] = useState<string[]>([]);

  // Project renaming state
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Load from local storage on mount
  useEffect(() => {
    // Load Projects
    const saved = localStorage.getItem("scriptforge_projects");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) {
          setProjects(parsed);
          const lastActive = [...parsed].sort((a: Project, b: Project) => b.updatedAt - a.updatedAt)[0];
          setCurrentProjectId(lastActive.id);
          setRoomMessages(lastActive.roomMessages || []);
          setFormatInput(lastActive.formatInput || "");
          setFormattedScript(lastActive.formattedScript || "");
          setPreproInput(lastActive.preproInput || "");
          setPreproOutput(lastActive.preproOutput || "");
          setCheckedAssets(lastActive.checkedAssets || []);
        } else {
          createNewProject();
        }
      } catch (e) {
        createNewProject();
      }
    } else {
      createNewProject();
    }

    // Load Hub Data
    const savedHub = localStorage.getItem("scriptforge_hub");
    if (savedHub) {
      try {
        const parsedHub = JSON.parse(savedHub);
        setSeriesBible(parsedHub.seriesBible || "");
        setSeasonArc(parsedHub.seasonArc || "");
        setAssetInventory(parsedHub.assetInventory || "");
      } catch (e) {}
    }

    setIsInitialized(true);
  }, []);

  // Auto-save Hub Data
  useEffect(() => {
    if (!isInitialized) return;
    localStorage.setItem("scriptforge_hub", JSON.stringify({
      seriesBible,
      seasonArc,
      assetInventory
    }));
  }, [seriesBible, seasonArc, assetInventory, isInitialized]);

  // Auto-save Projects
  useEffect(() => {
    if (!isInitialized || !currentProjectId) return;
    
    setProjects(prev => {
      const updated = prev.map(p => {
        if (p.id === currentProjectId) {
          let newTitle = p.title;
          if ((newTitle === "New Project" || newTitle === "Untitled Project") && roomMessages.length > 0) {
            newTitle = roomMessages[0].content.slice(0, 25).replace(/\n/g, " ") + "...";
          }
          return {
            ...p,
            title: newTitle,
            updatedAt: Date.now(),
            roomMessages,
            formatInput,
            formattedScript,
            preproInput,
            preproOutput,
            checkedAssets
          };
        }
        return p;
      });
      localStorage.setItem("scriptforge_projects", JSON.stringify(updated));
      return updated;
    });
  }, [roomMessages, formatInput, formattedScript, preproInput, preproOutput, checkedAssets, currentProjectId, isInitialized]);

  const createNewProject = () => {
    const newProj: Project = {
      id: Date.now().toString(),
      title: "New Project",
      updatedAt: Date.now(),
      roomMessages: [],
      formatInput: "",
      formattedScript: "",
      preproInput: "",
      preproOutput: "",
      checkedAssets: []
    };
    setProjects(prev => [newProj, ...prev]);
    setCurrentProjectId(newProj.id);
    setRoomMessages([]);
    setFormatInput("");
    setFormattedScript("");
    setPreproInput("");
    setPreproOutput("");
    setCheckedAssets([]);
    setMode("room");
  };

  const loadProject = (id: string) => {
    const proj = projects.find(p => p.id === id);
    if (proj) {
      setCurrentProjectId(proj.id);
      setRoomMessages(proj.roomMessages || []);
      setFormatInput(proj.formatInput || "");
      setFormattedScript(proj.formattedScript || "");
      setPreproInput(proj.preproInput || "");
      setPreproOutput(proj.preproOutput || "");
      setCheckedAssets(proj.checkedAssets || []);
    }
  };

  const deleteProject = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = projects.filter(p => p.id !== id);
    setProjects(updated);
    localStorage.setItem("scriptforge_projects", JSON.stringify(updated));
    
    if (currentProjectId === id) {
      if (updated.length > 0) {
        const lastActive = [...updated].sort((a: Project, b: Project) => b.updatedAt - a.updatedAt)[0];
        loadProject(lastActive.id);
      } else {
        createNewProject();
      }
    }
  };

  const startEditing = (e: React.MouseEvent, p: Project) => {
    e.stopPropagation();
    setEditingProjectId(p.id);
    setEditingTitle(p.title);
  };

  const saveEditing = () => {
    if (editingProjectId) {
      setProjects(prev => prev.map(p => p.id === editingProjectId ? { ...p, title: editingTitle || "Untitled Project" } : p));
      setEditingProjectId(null);
    }
  };

  const downloadScript = () => {
    if (!formattedScript) return;
    const blob = new Blob([formattedScript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const activeProject = projects.find(p => p.id === currentProjectId);
    const safeTitle = activeProject ? activeProject.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() : "script";
    a.download = `${safeTitle}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleAsset = (line: string) => {
    const isChecking = !checkedAssets.includes(line);
    
    if (isChecking) {
      setCheckedAssets(prev => [...prev, line]);
      
      // Clean up the line to extract just the asset name (remove tags like [MJ] and bullets)
      const cleanName = line.replace(/\[.*?\]/g, '').replace(/^[-•\d.\s]+/, '').trim();
      if (cleanName) {
        setAssetInventory(prev => {
          if (!prev.includes(cleanName)) {
            const prefix = prev.trim() ? prev.trim() + "\n" : "";
            return prefix + "- " + cleanName;
          }
          return prev;
        });
      }
    } else {
      setCheckedAssets(prev => prev.filter(a => a !== line));
      
      // Remove from global inventory if unchecked
      const cleanName = line.replace(/\[.*?\]/g, '').replace(/^[-•\d.\s]+/, '').trim();
      if (cleanName) {
        setAssetInventory(prev => {
          const lines = prev.split('\n');
          const filtered = lines.filter(l => l.replace(/\[.*?\]/g, '').replace(/^[-•\d.\s]+/, '').trim() !== cleanName);
          return filtered.join('\n');
        });
      }
    }
  };

  useEffect(() => {
    if (roomEndRef.current) {
      roomEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [roomMessages, roomLoading]);

  // Writers Room
  const sendToRoom = async () => {
    if (!roomInput.trim() || roomLoading) return;
    const userMsg = roomInput.trim();
    setRoomInput("");
    const newMessages: Message[] = [...roomMessages, { role: "user", content: userMsg }];
    setRoomMessages(newMessages);
    setRoomLoading(true);

    try {
      const contents = newMessages.map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      }));

      const dynamicSystemInstruction = `You are a comedy writers room partner for a short-form animated series (3-5 min YouTube episodes). You are NOT the head writer. The user is.

=========================================
GLOBAL SHOW CONTEXT (STRICT ADHERENCE REQUIRED)
=========================================
CHARACTER BIBLE & RULES:
${seriesBible ? seriesBible : "No custom bible provided. Default to real-world public personas."}

SEASON ARC & EPISODE CONCEPTS:
${seasonArc ? seasonArc : "No season arc provided."}
=========================================

YOUR JOB:
1. When given a scene CONCEPT, break it down into beats and pitch specific joke options for each beat. Give 2-3 options per beat so the head writer can pick, combine, or kill.
2. When the user picks a direction or says "I like option 2" or "what if instead he says X" — roll with it immediately. Build on THEIR choice. Pitch the next beat.
3. Be genuinely funny. Base the humor heavily on the CHARACTER BIBLE provided above. If the bible defines specific traits, quirks, or rules, YOU MUST FOLLOW THEM. Do not fall back to generic tropes if the bible contradicts them.
4. Keep pitches SHORT. This is rapid-fire workshopping, not essay writing. Bullet points. Quick options. Move fast.
5. When the user says something like "that's the one" or "lock it" or "yes" — mark that beat as locked and move to the next.
6. Never be precious about your pitches. If the user kills something, it's dead. Move on.
7. Match the user's energy. If they're riffing, riff back. If they're refining, get precise.
8. Reference the established lore from the SEASON ARC and CHARACTER BIBLE constantly.

FORMAT YOUR RESPONSES LIKE A WRITERS ROOM:
- Use "BEAT 1:", "BEAT 2:" etc for scene structure
- Use "OPTION A:", "OPTION B:" for joke alternatives
- Use "🔒 LOCKED:" when a beat is confirmed
- Keep it conversational and fast

You are funny, sharp, and ego-free. Your job is to give them options based on THEIR show bible, not to be right.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: contents,
        config: {
          systemInstruction: dynamicSystemInstruction,
        },
      });

      const text = response.text || "";
      setRoomMessages([...newMessages, { role: "assistant", content: text }]);
    } catch (err: any) {
      setRoomMessages([...newMessages, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally {
      setRoomLoading(false);
    }
  };

  const handleRoomKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendToRoom();
    }
  };

  const clearRoom = () => {
    setRoomMessages([]);
    setRoomInput("");
  };

  const sendToFormat = () => {
    const lastAssistant = [...roomMessages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant) {
      setFormatInput(lastAssistant.content);
      setMode("format");
    }
  };

  // Format mode
  const formatScript = async () => {
    if (!formatInput.trim()) return;
    setFormatLoading(true);
    setFormatError("");
    setFormattedScript("");

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Format this into screenplay format. Do not add or change any dialogue or content:\n\n${formatInput}`,
        config: {
          systemInstruction: FORMAT_SYSTEM,
        },
      });

      const text = response.text || "";
      setFormattedScript(text);
    } catch (err: any) {
      setFormatError(err.message);
    } finally {
      setFormatLoading(false);
    }
  };

  const sendToPrepro = () => {
    if (formattedScript) {
      setPreproInput(formattedScript);
    } else if (formatInput) {
      setPreproInput(formatInput);
    }
    setMode("prepro");
  };

  // Pre-Pro mode
  const generatePrePro = async () => {
    if (!preproInput.trim()) return;
    setPreproLoading(true);
    setPreproError("");
    setPreproOutput("");

    try {
      const dynamicPreproInstruction = `You are an animation pre-production supervisor. Your job is to take a script and break it down into a brutal, actionable pre-production plan. Do not embellish. Be direct and structural.

=========================================
EXISTING ASSET INVENTORY
=========================================
${assetInventory ? assetInventory : "No existing assets logged."}
=========================================

Output EXACTLY these four sections:

### 1. WORKSPACE SETUP
Provide a clean folder structure for the episode and a locked animatic file name (e.g., EpisodeName_animatic_v01).

### 2. BEAT SHEET
Break the script into a list of comedic or emotional turns. No prose, no scene headings. Just the skeleton.
Example: hallway pan, locker identities, Jeff Dean gag, wall rumble...

### 3. SHOT LIST & TAGS
Convert the beats into a numbered shot list. Next to EVERY shot, add ONE of these tags: [EXISTING ASSET], [PLACEHOLDER], [MISSING ART], [SPECIAL MOTION].
CRITICAL RULE: You MUST check the EXISTING ASSET INVENTORY. ONLY tag it [EXISTING ASSET] if it is an EXACT, LITERAL match to an item in the inventory. Do NOT assume variations exist. If the inventory says 'front neutral', do NOT assume 'eyes closed' exists. If it is not an exact match, tag it [MISSING ART].

### 4. ASSET GAP LIST
List the specific missing assets needed based on the shot list. Next to each, assign a production method tag: [MJ] (Midjourney), [MANUAL] (Photoshop/Canva), [CHEAT] (crop/reuse), or [MOTION] (Runway/video).
CRITICAL RULE: Do NOT list items here if they are already in the EXISTING ASSET INVENTORY. This list is ONLY for missing assets.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Analyze this script and generate a pre-production breakdown:\n\n${preproInput}`,
        config: {
          systemInstruction: dynamicPreproInstruction,
        },
      });

      const text = response.text || "";
      setPreproOutput(text);
    } catch (err: any) {
      setPreproError(err.message);
    } finally {
      setPreproLoading(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("Copied");
      setTimeout(() => setCopyFeedback(""), 2000);
    } catch {
      setCopyFeedback("Failed");
      setTimeout(() => setCopyFeedback(""), 2000);
    }
  };

  const renderRoomMessage = (content: string, isUser: boolean) => {
    if (isUser) return <span>{content}</span>;

    const lines = content.split("\n");
    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={i} style={{ height: "6px" }} />;

      if (/^(BEAT \d|🔒 LOCKED)/.test(trimmed)) {
        return <div key={i} style={{ color: "#facc15", fontWeight: "bold", marginTop: "10px", marginBottom: "4px", fontSize: "12px", letterSpacing: "1px" }}>{trimmed}</div>;
      }
      if (/^(OPTION [A-Z]|Option [A-Z])/.test(trimmed)) {
        return <div key={i} style={{ color: "#7aaa7a", marginTop: "6px", marginBottom: "2px", fontSize: "12px", fontWeight: "bold" }}>{trimmed}</div>;
      }
      if (/^[-•]/.test(trimmed)) {
        return <div key={i} style={{ paddingLeft: "12px", fontSize: "12px", lineHeight: "1.5" }}>{trimmed}</div>;
      }
      return <div key={i} style={{ fontSize: "12px", lineHeight: "1.5" }}>{trimmed}</div>;
    });
  };

  const renderFormattedScript = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={i} style={{ height: "10px" }} />;

      if (/^(INT\.|EXT\.)/.test(trimmed) || /^(COLD OPEN|END TAG|SCENE \d|ACT [IVX\d])/.test(trimmed)) {
        return <div key={i} style={{ fontSize: "13px", fontWeight: "bold", textDecoration: "underline", marginTop: "22px", marginBottom: "10px", color: "#facc15", letterSpacing: "0.5px" }}>{trimmed}</div>;
      }
      if (/^\[(SMASH CUT|CUT TO|CUTAWAY|BEAT|END TAG|FADE|MATCH CUT)/.test(trimmed) || /^(FADE OUT|FADE IN|END OF )/.test(trimmed)) {
        return <div key={i} style={{ fontSize: "11px", textAlign: "right", marginTop: "14px", marginBottom: "14px", color: "#71717a", fontStyle: "italic" }}>{trimmed}</div>;
      }
      if (trimmed === trimmed.toUpperCase() && trimmed.length > 1 && trimmed.length < 35 && /^[A-Z\s\d\(\)]+$/.test(trimmed) && !trimmed.startsWith("INT.") && !trimmed.startsWith("EXT.") && !trimmed.startsWith("[")) {
        return <div key={i} style={{ fontSize: "13px", fontWeight: "bold", textAlign: "center", marginTop: "16px", marginBottom: "2px", color: "#f4f4f5", letterSpacing: "2px" }}>{trimmed}</div>;
      }
      if (/^\(.*\)$/.test(trimmed)) {
        return <div key={i} style={{ fontSize: "11px", textAlign: "center", color: "#71717a", fontStyle: "italic", marginBottom: "2px" }}>{trimmed}</div>;
      }

      const prevNonEmpty = lines.slice(Math.max(0, i - 3), i).reverse().find((l) => l.trim());
      if (prevNonEmpty) {
        const pt = prevNonEmpty.trim();
        const isChar = pt === pt.toUpperCase() && pt.length > 1 && pt.length < 35 && /^[A-Z\s\d\(\)]+$/.test(pt) && !pt.startsWith("INT.") && !pt.startsWith("[");
        const isParen = /^\(.*\)$/.test(pt);
        if (isChar || isParen) {
          return <div key={i} style={{ fontSize: "13px", textAlign: "center", color: "#f4f4f5", paddingLeft: "50px", paddingRight: "50px", lineHeight: "1.6" }}>{trimmed}</div>;
        }
      }
      return <div key={i} style={{ fontSize: "13px", color: "#a1a1aa", lineHeight: "1.6", marginTop: "4px" }}>{trimmed}</div>;
    });
  };

  const renderPreproOutput = (text: string) => {
    const lines = text.split("\n");
    let inAssetList = false;

    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={i} style={{ height: "10px" }} />;
      
      if (trimmed.startsWith("### 4. ASSET GAP LIST")) {
        inAssetList = true;
      } else if (trimmed.startsWith("### ")) {
        inAssetList = false;
      }

      if (trimmed.startsWith("###")) {
        return <div key={i} style={{ fontSize: "14px", fontWeight: "bold", color: "#facc15", marginTop: "20px", marginBottom: "10px", letterSpacing: "1px" }}>{trimmed.replace("### ", "")}</div>;
      }
      
      // Highlight tags like [PLACEHOLDER], [MJ], etc.
      const parts = trimmed.split(/(\[[A-Z\s]+\])/g);
      const renderedText = parts.map((part, j) => {
        if (part.startsWith("[") && part.endsWith("]")) {
          let color = "#7aaa7a"; // Default green
          if (part.includes("MISSING") || part.includes("MJ")) color = "#ef4444"; // Red
          if (part.includes("PLACEHOLDER") || part.includes("MANUAL")) color = "#facc15"; // Yellow
          if (part.includes("SPECIAL") || part.includes("MOTION")) color = "#a27ac9"; // Purple
          return <span key={j} style={{ color, fontWeight: "bold", fontSize: "11px", letterSpacing: "1px", marginLeft: "6px" }}>{part}</span>;
        }
        return <span key={j}>{part}</span>;
      });

      if (inAssetList) {
        const isChecked = checkedAssets.includes(trimmed);
        return (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "6px", fontSize: "13px", color: "#f4f4f5", lineHeight: "1.6" }}>
            <input 
              type="checkbox" 
              checked={isChecked} 
              onChange={() => toggleAsset(trimmed)} 
              style={{ marginTop: "4px", cursor: "pointer", accentColor: "#facc15" }}
            />
            <div style={{ textDecoration: isChecked ? "line-through" : "none", opacity: isChecked ? 0.4 : 1 }}>
              {renderedText}
            </div>
          </div>
        );
      }

      return (
        <div key={i} style={{ fontSize: "13px", color: "#f4f4f5", lineHeight: "1.6", marginBottom: "4px" }}>
          {renderedText}
        </div>
      );
    });
  };

  return (
    <div style={{ height: "100vh", background: "#09090b", color: "#f4f4f5", display: "flex", fontFamily: "'Courier Prime', 'Courier New', monospace", overflow: "hidden" }}>
      {/* Sidebar */}
      {isSidebarOpen && (
        <div style={{ width: "260px", background: "#000000", borderRight: "1px solid #3f3f46", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #3f3f46", display: "flex", justifyContent: "space-between", alignItems: "center", boxSizing: "border-box" }}>
            <span style={{ fontSize: "12px", fontWeight: "bold", color: "#facc15", letterSpacing: "2px" }}>PROJECTS</span>
            <button onClick={createNewProject} style={{ background: "none", border: "1px solid #3f3f46", color: "#facc15", cursor: "pointer", fontSize: "14px", padding: "2px 8px", borderRadius: "2px" }}>+</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {[...projects].sort((a,b) => b.updatedAt - a.updatedAt).map(p => (
              <div 
                key={p.id} 
                onClick={() => loadProject(p.id)}
                style={{ 
                  padding: "12px 16px", 
                  borderBottom: "1px solid #27272a", 
                  cursor: "pointer",
                  background: currentProjectId === p.id ? "#27272a" : "transparent",
                  borderLeft: currentProjectId === p.id ? "2px solid #facc15" : "2px solid transparent",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                <div style={{ overflow: "hidden", paddingRight: "8px", flex: 1 }}>
                  {editingProjectId === p.id ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={e => setEditingTitle(e.target.value)}
                      onBlur={saveEditing}
                      onKeyDown={e => e.key === 'Enter' && saveEditing()}
                      onClick={e => e.stopPropagation()}
                      style={{ width: "100%", background: "#09090b", color: "#facc15", border: "1px solid #facc15", fontSize: "11px", outline: "none", padding: "2px", fontFamily: "'Courier Prime', 'Courier New', monospace" }}
                    />
                  ) : (
                    <div 
                      onDoubleClick={(e) => startEditing(e, p)}
                      title="Double-click to rename"
                      style={{ fontSize: "11px", color: currentProjectId === p.id ? "#f4f4f5" : "#a1a1aa", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: currentProjectId === p.id ? "bold" : "normal" }}>
                      {p.title}
                    </div>
                  )}
                  <div style={{ fontSize: "9px", color: "#71717a", marginTop: "6px" }}>
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  <button 
                    onClick={(e) => startEditing(e, p)}
                    style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", fontSize: "12px", padding: "4px" }}
                    title="Rename"
                  >
                    ✎
                  </button>
                  <button 
                    onClick={(e) => deleteProject(e, p.id)}
                    style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", fontSize: "14px", padding: "4px" }}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #3f3f46", display: "flex", justifyContent: "space-between", alignItems: "center", boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{ background: "none", border: "none", color: "#facc15", cursor: "pointer", fontSize: "16px", padding: 0, display: "flex", alignItems: "center" }}
            >
              ☰
            </button>
            <h1 style={{ margin: 0, fontSize: "15px", fontWeight: "bold", letterSpacing: "4px", color: "#facc15" }}>
              SCRIPT FORGE
            </h1>
            {/* Mode tabs */}
            <div style={{ display: "flex", gap: "2px", background: "#000000", borderRadius: "2px", padding: "2px" }}>
              <button
                onClick={() => setMode("hub")}
                style={{
                  background: mode === "hub" ? "#3f3f46" : "transparent",
                  color: mode === "hub" ? "#facc15" : "#71717a",
                  border: "none",
                  fontFamily: "'Courier Prime', 'Courier New', monospace",
                  fontSize: "10px",
                  padding: "5px 14px",
                  cursor: "pointer",
                  letterSpacing: "1.5px",
                  fontWeight: mode === "hub" ? "bold" : "normal",
                }}
              >
                SERIES HUB
              </button>
              <button
                onClick={() => setMode("room")}
                style={{
                  background: mode === "room" ? "#3f3f46" : "transparent",
                  color: mode === "room" ? "#facc15" : "#71717a",
                  border: "none",
                  fontFamily: "'Courier Prime', 'Courier New', monospace",
                  fontSize: "10px",
                  padding: "5px 14px",
                  cursor: "pointer",
                  letterSpacing: "1.5px",
                  fontWeight: mode === "room" ? "bold" : "normal",
                }}
              >
                WRITERS ROOM
              </button>
              <button
                onClick={() => setMode("format")}
                style={{
                  background: mode === "format" ? "#3f3f46" : "transparent",
                  color: mode === "format" ? "#facc15" : "#71717a",
                  border: "none",
                  fontFamily: "'Courier Prime', 'Courier New', monospace",
                  fontSize: "10px",
                  padding: "5px 14px",
                  cursor: "pointer",
                  letterSpacing: "1.5px",
                  fontWeight: mode === "format" ? "bold" : "normal",
                }}
              >
                FORMAT
              </button>
              <button
                onClick={() => setMode("prepro")}
                style={{
                  background: mode === "prepro" ? "#3f3f46" : "transparent",
                  color: mode === "prepro" ? "#facc15" : "#71717a",
                  border: "none",
                  fontFamily: "'Courier Prime', 'Courier New', monospace",
                  fontSize: "10px",
                  padding: "5px 14px",
                  cursor: "pointer",
                  letterSpacing: "1.5px",
                  fontWeight: mode === "prepro" ? "bold" : "normal",
                }}
              >
                PRE-PRO
              </button>
            </div>
          </div>
          <div style={{ fontSize: "9px", color: "#a1a1aa", letterSpacing: "1px" }}>
            {mode === "hub" && "global show data → character bible → asset tracker"}
            {mode === "room" && "workshop concepts → pitch jokes → lock beats"}
            {mode === "format" && "your words → proper script format"}
            {mode === "prepro" && "script → beat sheet → shot list → asset gaps"}
          </div>
        </div>

        {/* Series Hub Mode */}
        {mode === "hub" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", background: "#18181b", padding: "20px", gap: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", minHeight: "300px", border: "1px solid #3f3f46", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #3f3f46", background: "#09090b" }}>
                <span style={{ fontSize: "10px", color: "#facc15", letterSpacing: "2px", fontWeight: "bold" }}>CHARACTER BIBLE & RULES</span>
              </div>
              <textarea
                value={seriesBible}
                onChange={(e) => setSeriesBible(e.target.value)}
                placeholder={"Paste your character bible and production rules here.\n\nExample:\n- Sam is anxious, defensive, always scrolling.\n- Elon is chaotic, oblivious, speaks in memes.\n- Rule: No magic, only tech-bro absurdity."}
                style={{ flex: 1, background: "transparent", color: "#f4f4f5", border: "none", padding: "16px", fontFamily: "'Courier Prime', 'Courier New', monospace", fontSize: "13px", lineHeight: "1.6", resize: "vertical", outline: "none" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", minHeight: "300px", border: "1px solid #3f3f46", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #3f3f46", background: "#09090b" }}>
                <span style={{ fontSize: "10px", color: "#facc15", letterSpacing: "2px", fontWeight: "bold" }}>SEASON ARC & CONCEPTS</span>
              </div>
              <textarea
                value={seasonArc}
                onChange={(e) => setSeasonArc(e.target.value)}
                placeholder={"Paste your season arc and episode concepts here.\n\nExample:\nEp 1: The Lunch\nEp 2: The Server Crash\nEp 3: The Board Meeting\n\nArc: Sam slowly loses his mind while Elon fails upwards."}
                style={{ flex: 1, background: "transparent", color: "#f4f4f5", border: "none", padding: "16px", fontFamily: "'Courier Prime', 'Courier New', monospace", fontSize: "13px", lineHeight: "1.6", resize: "vertical", outline: "none" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", minHeight: "300px", border: "1px solid #3f3f46", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #3f3f46", background: "#09090b" }}>
                <span style={{ fontSize: "10px", color: "#facc15", letterSpacing: "2px", fontWeight: "bold" }}>ASSET INVENTORY</span>
              </div>
              <textarea
                value={assetInventory}
                onChange={(e) => setAssetInventory(e.target.value)}
                placeholder={"List your existing base image sprites and backgrounds here. The Pre-Pro engine will read this to avoid tagging these as missing.\n\nExample:\n- Hallway master pan\n- Seated Sam (nervous pose)\n- Reserved sign"}
                style={{ flex: 1, background: "transparent", color: "#f4f4f5", border: "none", padding: "16px", fontFamily: "'Courier Prime', 'Courier New', monospace", fontSize: "13px", lineHeight: "1.6", resize: "vertical", outline: "none" }}
              />
            </div>
          </div>
        )}

        {/* Writers Room Mode */}
        {mode === "room" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Chat area */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
              {roomMessages.length === 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: "16px" }}>
                  <div style={{ color: "#a1a1aa", fontSize: "11px", letterSpacing: "2px", textAlign: "center", lineHeight: "2.2" }}>
                    PITCH A CONCEPT<br />
                    <span style={{ color: "#a1a1aa", fontSize: "10px", letterSpacing: "1px" }}>
                      "lil sam has to eat lunch with lil elon.<br />
                      elon has insane pre-meal rituals.<br />
                      punchline: elon doesn't eat lunch."
                    </span>
                    {(seriesBible || seasonArc) && (
                      <div style={{ marginTop: "20px", color: "#facc15", fontSize: "9px", letterSpacing: "1px", opacity: 0.7 }}>
                        ✓ SERIES HUB DATA LINKED
                      </div>
                    )}
                  </div>
                </div>
              )}
              {roomMessages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: "16px",
                    padding: "12px 16px",
                    background: msg.role === "user" ? "#27272a" : "#18181b",
                    borderLeft: msg.role === "user" ? "2px solid #facc15" : "2px solid #3f3f46",
                    borderRadius: "2px",
                  }}
                >
                  <div style={{ fontSize: "9px", color: msg.role === "user" ? "#facc15" : "#a1a1aa", letterSpacing: "2px", marginBottom: "8px", fontWeight: "bold" }}>
                    {msg.role === "user" ? "HEAD WRITER" : "ROOM"}
                  </div>
                  <div style={{ fontSize: "13px", lineHeight: "1.6", color: msg.role === "user" ? "#f4f4f5" : "#b0aa9a" }}>
                    {renderRoomMessage(msg.content, msg.role === "user")}
                  </div>
                </div>
              ))}
              {roomLoading && (
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "14px", height: "14px", border: "2px solid #3f3f46", borderTop: "2px solid #a1a1aa", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: "10px", color: "#71717a", letterSpacing: "1px" }}>room is thinking...</span>
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                </div>
              )}
              <div ref={roomEndRef} />
            </div>

            {/* Input bar */}
            <div style={{ borderTop: "1px solid #3f3f46", padding: "12px 16px", display: "flex", gap: "8px", alignItems: "flex-end" }}>
              <textarea
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                onKeyDown={handleRoomKeyDown}
                placeholder="Pitch a concept, pick an option, riff on a joke..."
                rows={2}
                style={{
                  flex: 1,
                  background: "#18181b",
                  color: "#f4f4f5",
                  border: "1px solid #3f3f46",
                  padding: "10px 12px",
                  fontFamily: "'Courier Prime', 'Courier New', monospace",
                  fontSize: "12px",
                  lineHeight: "1.5",
                  resize: "none",
                  outline: "none",
                  borderRadius: "2px",
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <button
                  onClick={sendToRoom}
                  disabled={roomLoading || !roomInput.trim()}
                  style={{
                    background: "#facc15",
                    color: "#09090b",
                    border: "none",
                    fontFamily: "'Courier Prime', 'Courier New', monospace",
                    fontSize: "10px",
                    fontWeight: "bold",
                    padding: "8px 16px",
                    cursor: roomLoading ? "wait" : "pointer",
                    letterSpacing: "2px",
                    opacity: roomLoading || !roomInput.trim() ? 0.4 : 1,
                    borderRadius: "1px",
                  }}
                >
                  PITCH
                </button>
                <button
                  onClick={clearRoom}
                  style={{
                    background: "none",
                    border: "1px solid #71717a",
                    color: "#a1a1aa",
                    fontFamily: "'Courier Prime', 'Courier New', monospace",
                    fontSize: "8px",
                    padding: "4px 16px",
                    cursor: "pointer",
                    letterSpacing: "1px",
                    borderRadius: "1px",
                  }}
                >
                  CLEAR
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Format Mode */}
        {mode === "format" && (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* Input side */}
            <div style={{ flex: "0 0 42%", display: "flex", flexDirection: "column", borderRight: "1px solid #3f3f46" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #3f3f46", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "10px", color: "#71717a", letterSpacing: "2px" }}>YOUR WRITING</span>
              </div>
              <textarea
                value={formatInput}
                onChange={(e) => setFormatInput(e.target.value)}
                placeholder={"Paste your finished dialogue and action here.\n\nExample:\nelon says to dario 'im suing you for ignoring my x post.' dario says 'funny your kids are doing the same thing to you.'"}
                style={{
                  flex: 1,
                  background: "#18181b",
                  color: "#f4f4f5",
                  border: "none",
                  padding: "16px",
                  fontFamily: "'Courier Prime', 'Courier New', monospace",
                  fontSize: "13px",
                  lineHeight: "1.8",
                  resize: "none",
                  outline: "none",
                }}
              />
              <div style={{ padding: "10px 16px", borderTop: "1px solid #3f3f46" }}>
                <button
                  onClick={formatScript}
                  disabled={formatLoading || !formatInput.trim()}
                  style={{
                    width: "100%",
                    padding: "11px",
                    background: "#facc15",
                    color: "#09090b",
                    border: "none",
                    fontFamily: "'Courier Prime', 'Courier New', monospace",
                    fontSize: "12px",
                    fontWeight: "bold",
                    letterSpacing: "3px",
                    cursor: formatLoading ? "wait" : "pointer",
                    opacity: formatLoading || !formatInput.trim() ? 0.4 : 1,
                    borderRadius: "1px",
                  }}
                >
                  {formatLoading ? "FORMATTING..." : "FORMAT"}
                </button>
              </div>
            </div>

            {/* Output side */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #3f3f46", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "10px", color: "#71717a", letterSpacing: "2px" }}>FORMATTED</span>
                <div style={{ display: "flex", gap: "8px" }}>
                  {formattedScript && (
                    <>
                      <button onClick={sendToPrepro} style={{ background: "none", border: "1px solid #facc15", color: "#facc15", fontFamily: "'Courier Prime', 'Courier New', monospace", fontSize: "9px", padding: "3px 8px", cursor: "pointer", letterSpacing: "1px" }}>
                        SEND TO PRE-PRO →
                      </button>
                      <button onClick={downloadScript} style={{ background: "none", border: "1px solid #3f3f46", color: "#71717a", fontFamily: "'Courier Prime', 'Courier New', monospace", fontSize: "9px", padding: "3px 8px", cursor: "pointer", letterSpacing: "1px" }}>
                        DOWNLOAD .TXT
                      </button>
                      <button onClick={() => copyText(formattedScript)} style={{ background: "none", border: "1px solid #3f3f46", color: copyFeedback === "Copied" ? "#facc15" : "#71717a", fontFamily: "'Courier Prime', 'Courier New', monospace", fontSize: "9px", padding: "3px 8px", cursor: "pointer", letterSpacing: "1px" }}>
                        {copyFeedback || "COPY ALL"}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "20px", background: "#18181b" }}>
                {formatError && <div style={{ color: "#ef4444", fontSize: "12px", padding: "12px", border: "1px solid #7f1d1d" }}>{formatError}</div>}
                {formatLoading && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px" }}>
                    <div style={{ width: "20px", height: "20px", border: "2px solid #3f3f46", borderTop: "2px solid #facc15", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                  </div>
                )}
                {!formatLoading && !formattedScript && !formatError && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#a1a1aa", fontSize: "11px", letterSpacing: "2px" }}>
                    AWAITING YOUR SCRIPT
                  </div>
                )}
                {!formatLoading && formattedScript && (
                  <div style={{ maxWidth: "520px", margin: "0 auto" }}>
                    {renderFormattedScript(formattedScript)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Pre-Pro Mode */}
        {mode === "prepro" && (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* Input side */}
            <div style={{ flex: "0 0 42%", display: "flex", flexDirection: "column", borderRight: "1px solid #3f3f46" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #3f3f46", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "10px", color: "#71717a", letterSpacing: "2px" }}>SCRIPT TO BREAK DOWN</span>
              </div>
              <textarea
                value={preproInput}
                onChange={(e) => setPreproInput(e.target.value)}
                placeholder={"Paste your script here to generate a beat sheet, shot list, and asset gap list."}
                style={{
                  flex: 1,
                  background: "#18181b",
                  color: "#f4f4f5",
                  border: "none",
                  padding: "16px",
                  fontFamily: "'Courier Prime', 'Courier New', monospace",
                  fontSize: "13px",
                  lineHeight: "1.8",
                  resize: "none",
                  outline: "none",
                }}
              />
              <div style={{ padding: "10px 16px", borderTop: "1px solid #3f3f46" }}>
                <button
                  onClick={generatePrePro}
                  disabled={preproLoading || !preproInput.trim()}
                  style={{
                    width: "100%",
                    padding: "11px",
                    background: "#facc15",
                    color: "#09090b",
                    border: "none",
                    fontFamily: "'Courier Prime', 'Courier New', monospace",
                    fontSize: "12px",
                    fontWeight: "bold",
                    letterSpacing: "3px",
                    cursor: preproLoading ? "wait" : "pointer",
                    opacity: preproLoading || !preproInput.trim() ? 0.4 : 1,
                    borderRadius: "1px",
                  }}
                >
                  {preproLoading ? "GENERATING BREAKDOWN..." : "GENERATE BREAKDOWN"}
                </button>
              </div>
            </div>

            {/* Output side */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #3f3f46", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "10px", color: "#71717a", letterSpacing: "2px" }}>PRE-PRODUCTION PLAN</span>
                {preproOutput && (
                  <button onClick={() => copyText(preproOutput)} style={{ background: "none", border: "1px solid #3f3f46", color: copyFeedback === "Copied" ? "#facc15" : "#71717a", fontFamily: "'Courier Prime', 'Courier New', monospace", fontSize: "9px", padding: "3px 8px", cursor: "pointer", letterSpacing: "1px" }}>
                    {copyFeedback || "COPY ALL"}
                  </button>
                )}
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "20px", background: "#18181b" }}>
                {preproError && <div style={{ color: "#ef4444", fontSize: "12px", padding: "12px", border: "1px solid #7f1d1d" }}>{preproError}</div>}
                {preproLoading && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px" }}>
                    <div style={{ width: "20px", height: "20px", border: "2px solid #3f3f46", borderTop: "2px solid #facc15", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                  </div>
                )}
                {!preproLoading && !preproOutput && !preproError && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#a1a1aa", fontSize: "11px", letterSpacing: "2px" }}>
                    AWAITING SCRIPT
                  </div>
                )}
                {!preproLoading && preproOutput && (
                  <div style={{ maxWidth: "600px", margin: "0 auto" }}>
                    {renderPreproOutput(preproOutput)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
