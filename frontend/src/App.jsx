import { useState, useCallback, useRef } from "react";
import VaspPanel from "./components/VaspPanel";
import StatusBadge from "./components/StatusBadge";
import ResultPanel from "./components/ResultPanel";
import { CUSTOMERS, THRESHOLD } from "./lib/prover.js";
import "./App.css";

// Configuration & Environment Variables
const ENV = {
    contractId: import.meta.env.VITE_CONTRACT_ID,
    rpcUrl: import.meta.env.VITE_RPC_URL,
    networkPassphrase: import.meta.env.VITE_NETWORK_PASSPHRASE,
    vaspAAddress: import.meta.env.VITE_VASP_A_ADDRESS,
    vaspBAddress: import.meta.env.VITE_VASP_B_ADDRESS,
    vaspASecret: import.meta.env.VITE_VASP_A_SECRET,
    vaspBSecret: import.meta.env.VITE_VASP_B_SECRET,
};

// Sender Options (Alice = success, Carol = fail)
const SENDER_OPTIONS = [
    { key: "alice", label: "Alice — Indonesia (will pass)" },
    {
        key: "carol",
        label: "Carol — Iran (will fail, prohibited jurisdiction)",
    },
];

const RECEIVER_KEY = "bob"; // Fixed receiver for demo

const NATIONALITY_MAP = {
    alice: "Indonesia",
    bob: "Singapore",
    carol: "Iran",
};

export default function App() {
    // --- States ---
    const [senderKey, setSenderKey] = useState("alice");
    const [amount, setAmount] = useState("1000"); // USD display value
    const [phase, setPhase] = useState("idle");
    const [logsA, setLogsA] = useState([]);
    const [logsB, setLogsB] = useState([]);
    const [intentId, setIntentId] = useState(null);
    const [txHashField, setTxHashField] = useState(null);
    const [txHashA, setTxHashA] = useState(null);
    const [txHashB, setTxHashB] = useState(null);
    const [error, setError] = useState(null);

    // --- Refs ---
    const workerRef = useRef(null);

    // --- Derived States ---
    const sender = CUSTOMERS[senderKey];
    const done = ["cleared", "failed", "rejected"].includes(phase);

    // --- Helper Functions ---
    function toCircuitAmount(usdStr) {
        const usd = parseFloat(usdStr) || 0;
        return BigInt(Math.round(usd * 10_000_000));
    }

    const isAboveThreshold = toCircuitAmount(amount) >= THRESHOLD;

    function addLog(side, msg, status = "done") {
        const setter = side === "A" ? setLogsA : setLogsB;
        setter((p) => [...p, { msg, status, id: Date.now() + Math.random() }]);
    }

    function reset() {
        setPhase("idle");
        setLogsA([]);
        setLogsB([]);
        setIntentId(null);
        setTxHashField(null);
        setTxHashA(null);
        setTxHashB(null);
        setError(null);

        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
    }

    function spawnWorker() {
        const w = new Worker(new URL("./lib/flow.worker.js", import.meta.url), {
            type: "module",
        });
        w.onmessage = ({ data: { type, payload } }) => {
            if (type === "log_a") addLog("A", payload.msg, payload.status);
            if (type === "log_b") addLog("B", payload.msg, payload.status);
            if (type === "phase") setPhase(payload);
            if (type === "intent_id") setIntentId(payload);
            if (type === "tx_hash_field") setTxHashField(payload);
            if (type === "tx_a") setTxHashA(payload);
            if (type === "tx_b") setTxHashB(payload);
            if (type === "error") {
                setError(payload);
                setPhase("failed");
            }
        };
        workerRef.current = w;
        return w;
    }

    // Dynamically evaluate the status light color for each sub-circuit.
    const getCircuitStatus = (circuitsInvolved, activePhases) => {
        if (
            phase === "failed" &&
            senderKey === "carol" &&
            circuitsInvolved.includes("c3")
        )
            return "status-failed";
        if (activePhases.includes(phase)) return "status-active";

        const allPhases = [
            "proving_a",
            "submitting_a",
            "pending_b",
            "proving_b",
            "submitting_b",
            "cleared",
        ];
        const currentIdx = allPhases.indexOf(phase);
        const maxTargetIdx = Math.max(
            ...activePhases.map((p) => allPhases.indexOf(p)),
        );

        if (
            currentIdx > maxTargetIdx &&
            phase !== "idle" &&
            phase !== "rejected"
        )
            return "status-completed";
        return "status-idle";
    };

    // --- Callbacks / Handlers ---
    const handleTransfer = useCallback(() => {
        reset();
        const amountBigInt = toCircuitAmount(amount);

        if (amountBigInt < THRESHOLD) {
            setPhase("failed");
            setError({
                message:
                    "Transaction amount is below the $1,000 threshold. Travel Rule ZK Proof generation is not required for micro-transactions.",
            });
            addLog(
                "A",
                "Aborted: Amount is below regulatory threshold.",
                "rejected",
            );
            return;
        }
        setPhase("proving_a");
        const w = spawnWorker();
        w.postMessage({
            type: "submit_intent",
            senderKey,
            receiverKey: RECEIVER_KEY,
            amount: amountBigInt.toString(),
            env: ENV,
        });
    }, [senderKey, amount]);

    const handleApprove = useCallback(() => {
        if (phase !== "pending_b" || !workerRef.current) return;
        setPhase("proving_b");
        workerRef.current.postMessage({
            type: "counter_sign",
            intentId,
            receiverKey: RECEIVER_KEY,
            amount: toCircuitAmount(amount).toString(),
            txHashField,
            env: ENV,
        });
    }, [phase, intentId, txHashField, amount]);

    const handleReject = useCallback(() => {
        if (phase !== "pending_b" || !workerRef.current) return;
        workerRef.current.postMessage({
            type: "reject_intent",
            intentId,
            env: ENV,
        });
        setPhase("rejected");
        addLog("B", "Intent rejected by VASP_B", "rejected");
    }, [phase, intentId]);

    return (
        <div className="app-container">
            <div className="app">
                {/* HEADER SECTION */}
                <header className="hdr">
                    {/* Left Side Header: Logo + Project title */}
                    <div className="hdr-left">
                        <svg
                            className="hdr-logo"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 -960 960 960"
                            fill="#1d4ed8"
                        >
                            <path d="M200-280v-280h80v280h-80Zm240 0v-280h80v280h-80ZM80-640v-80l400-200 400 200v80H80Zm179-80h442L480-830 259-720ZM80-120v-80h482q2 21 5 40.5t9 39.5H80Zm600-310v-130h80v90l-80 40ZM800 0q-69-17-114.5-79.5T640-218v-102l160-80 160 80v102q0 76-45.5 138.5T800 0Zm-29-120 139-138-42-42-97 95-39-39-42 43 81 81ZM259-720h442-442Z" />
                        </svg>
                        <div>
                            <p className="hdr-title">zk-Travel Rule</p>
                            <p className="hdr-sub">
                                Stellar testnet · privacy-preserving compliance
                            </p>
                        </div>
                    </div>

                    {/* Right Side Header: Menu Control + Social Media Links */}
                    <div className="hdr-right">
                        <div className="controls">
                            <div className="control-group">
                                <label className="control-label">Sender</label>
                                <select
                                    value={senderKey}
                                    onChange={(e) => {
                                        setSenderKey(e.target.value);
                                        reset();
                                    }}
                                    disabled={phase !== "idle" && !done}
                                >
                                    {SENDER_OPTIONS.map((o) => (
                                        <option key={o.key} value={o.key}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="control-group">
                                <label className="control-label">
                                    Amount (USD)
                                </label>
                                <div className="amount-input-wrap">
                                    <span className="amount-prefix">$</span>
                                    <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={amount}
                                        onChange={(e) =>
                                            setAmount(e.target.value)
                                        }
                                        disabled={phase !== "idle" && !done}
                                        className="amount-input"
                                    />
                                </div>
                                {!isAboveThreshold && (
                                    <span className="threshold-warn">
                                        below $1,000 threshold
                                    </span>
                                )}
                            </div>
                        </div>
                        {/* Link Social account (GitHub & X) */}
                        <div className="social-links">
                            <a
                                href="https://github.com/0xMoZi"
                                target="_blank"
                                rel="noreferrer"
                                title="View Source on GitHub"
                                className="social-icon-btn"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="feather-github"
                                >
                                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                                </svg>
                            </a>
                            <a
                                href="https://x.com/MoZi_v1"
                                target="_blank"
                                rel="noreferrer"
                                title="Follow on Twitter / X"
                                className="social-icon-btn"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    className="feather-twitter"
                                >
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                </svg>
                            </a>
                        </div>
                    </div>
                </header>
                {/* 📊 GLOBAL COMPLIANCE METRICS BAR */}
                <div className="metrics-bar">
                    <div className="metric-card">
                        <span className="metric-label">
                            REGULATOR THRESHOLD
                        </span>
                        <span className="metric-value">$1.000 USD</span>
                    </div>
                    <div className="metric-card">
                        <span className="metric-label">ROUTING NETWORK</span>
                        <span className="metric-value network-badge">
                            Stellar Testnet
                        </span>
                    </div>
                    <div className="metric-card">
                        <span className="metric-label">
                            ACTIVE VERIFIER CONTRACT
                        </span>
                        <span className="metric-value contract-code">
                            {ENV.contractId
                                ? `${ENV.contractId}`
                                : "Not Initialized"}
                        </span>
                    </div>
                </div>
                {/* VASP PANELS */}
                <div className="panels">
                    <VaspPanel
                        role="A"
                        label="VASP_A — Sender"
                        name={sender.name || senderKey}
                        nationality={NATIONALITY_MAP[senderKey] || "Unknown"}
                        logs={logsA}
                        phase={phase}
                        txHash={txHashA}
                        onTransfer={handleTransfer}
                        disabled={phase !== "idle" && !done}
                        willFail={sender.willFail}
                    />

                    <div className="mid">
                        <StatusBadge phase={phase} />
                        {intentId && (
                            <div className="intent-pill">
                                <span>intent</span>
                                <code>{intentId.slice(0, 14)}…</code>
                            </div>
                        )}
                    </div>

                    <VaspPanel
                        role="B"
                        label="VASP_B — Receiver"
                        name="Bob"
                        nationality="Singapore"
                        logs={logsB}
                        phase={phase}
                        txHash={txHashB}
                        isPendingApproval={phase === "pending_b"}
                        onApprove={handleApprove}
                        onReject={handleReject}
                    />
                </div>
                {/* CLIENT-SIDE MULTI-THREADED ZK CIRCUIT PIPELINE */}
                <div className="circuit-tracker-section">
                    <p className="tracker-title">
                        ⚙️ Client-Side Multi-Threaded ZK Circuit Pipeline
                    </p>
                    <div className="composed-pipeline-container">
                        {/* Left: Block created core.circom */}
                        <div className="composed-block">
                            <div className="composed-header">
                                🏗️ COMPOSED TARGET: core.circom (VASP_A)
                            </div>
                            <div className="sub-circuits-grid c-three">
                                <div
                                    className={`circuit-card ${getCircuitStatus(["c1"], ["proving_a"])}`}
                                >
                                    <div className="circuit-id">
                                        c1_identity
                                    </div>
                                    <div className="circuit-desc">
                                        Verify EdDSA Key Ownership
                                    </div>
                                </div>
                                <div
                                    className={`circuit-card ${getCircuitStatus(["c4"], ["proving_a"])}`}
                                >
                                    <div className="circuit-id">c4_amount</div>
                                    <div className="circuit-desc">
                                        Check Rule Trigger Threshold
                                    </div>
                                </div>
                                <div
                                    className={`circuit-card ${getCircuitStatus(["c5"], ["proving_a", "submitting_a"])}`}
                                >
                                    <div className="circuit-id">c5_vasp</div>
                                    <div className="circuit-desc">
                                        Assemble Masked Transaction Hash
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right: Block created smt.circom */}
                        <div className="composed-block">
                            <div className="composed-header">
                                🏗️ COMPOSED TARGET: smt.circom (VASP_B)
                            </div>
                            <div className="sub-circuits-grid c-two">
                                <div
                                    className={`circuit-card ${getCircuitStatus(["c2"], ["proving_b"])}`}
                                >
                                    <div className="circuit-id">
                                        c2_sanction
                                    </div>
                                    <div className="circuit-desc">
                                        Generate 20-Level SMT Blacklist
                                    </div>
                                </div>
                                <div
                                    className={`circuit-card ${getCircuitStatus(["c3"], ["proving_b"])}`}
                                >
                                    <div className="circuit-id">
                                        c3_jurisdiction
                                    </div>
                                    <div className="circuit-desc">
                                        Validate ISO Non-Prohibited Node
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>{" "}
                </div>{" "}
                {/* RESULT PANEL */}
                {done && (
                    <ResultPanel
                        phase={phase}
                        error={error}
                        txHashA={txHashA}
                        txHashB={txHashB}
                        onReset={reset}
                    />
                )}
            </div>
        </div>
    );
}
