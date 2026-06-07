"use client";

import { useEffect, useRef, useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit';
import { Shield, ShieldAlert, Cpu, Calendar, TrendingUp, ChevronRight, Activity, Zap } from 'lucide-react';
import gsap from 'gsap';
import AmberCascades from './AmberCascades';

// ============================================================
// Features Section Data
// ============================================================
const CAPABILITIES = [
  {
    title: 'Scoped Vaults',
    slug: 'scoped-vaults',
    description: 'Create isolated vaults per agent with programmable spending caps, daily budgets, and protocol restrictions. Each vault is a first-class Sui object with granular policy controls.',
    image: '/images/capability-1.jpg',
  },
  {
    title: 'Policy Engine',
    slug: 'policy-engine',
    description: 'Define per-transaction limits, whitelist approved DeFi protocols like Cetus and DeepBook, set active hours, and configure auto-refill rules. All enforced atomically via Sui PTBs.',
    image: '/images/capability-2.jpg',
  },
  {
    title: 'Kill Switch',
    slug: 'kill-switch',
    description: 'One-click vault freeze. Sub-second on-chain revocation. When an agent goes rogue, your funds are protected before the next block finalizes.',
    image: '/images/capability-3.jpg',
  },
];

// ============================================================
// Agent Ecosystem Data
// ============================================================
const AGENTS = [
  { title: 'Trading Bots', category: 'DeFi Agents', year: '2026', image: '/images/research-1.jpg' },
  { title: 'Data Collectors', category: 'Analytics Agents', year: '2026', image: '/images/research-2.jpg' },
  { title: 'Content Creators', category: 'Social Agents', year: '2026', image: '/images/research-3.jpg' },
  { title: 'Swarm Coordinators', category: 'Multi-Agent', year: '2026', image: '/images/research-4.jpg' },
  { title: 'Oracle Feeders', category: 'Infrastructure', year: '2026', image: '/images/research-1.jpg' },
  { title: 'Liquidity Managers', category: 'Market Makers', year: '2026', image: '/images/research-2.jpg' },
  { title: 'NFT Agents', category: 'Collectible Traders', year: '2026', image: '/images/research-3.jpg' },
  { title: 'Governance Bots', category: 'DAO Agents', year: '2026', image: '/images/research-4.jpg' },
];

export default function LandingPage() {
  const [titleWidth, setTitleWidth] = useState<number>(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const featureItemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);

  const architectureRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const archTextRef = useRef<HTMLHeadingElement>(null);

  const agentsRef = useRef<HTMLDivElement>(null);
  const agentItemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ============================================================
  // Measure title width for subtitle alignment
  // ============================================================
  useEffect(() => {
    const measure = () => {
      if (titleRef.current) setTitleWidth(titleRef.current.offsetWidth);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // ============================================================
  // GSAP Animations on Mount / Scroll
  // ============================================================
  useEffect(() => {
    // 1. Feature Cards intersection reveal
    const featureItems = featureItemRefs.current.filter(Boolean) as HTMLDivElement[];
    const featureObservers: IntersectionObserver[] = [];

    featureItems.forEach((item, index) => {
      gsap.set(item, { opacity: 0, y: 60 });
      const obs = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            gsap.to(item, {
              opacity: 1,
              y: 0,
              duration: 1.0,
              delay: index * 0.15,
              ease: 'power3.out',
            });
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });
      obs.observe(item);
      featureObservers.push(obs);
    });

    // 2. Architecture text reveal
    const archText = archTextRef.current;
    if (archText) {
      gsap.set(archText, { opacity: 0, y: 40 });
      const archObs = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            gsap.to(archText, {
              opacity: 1,
              y: 0,
              duration: 1.2,
              ease: 'power3.out',
            });
            archObs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.25 });
      archObs.observe(archText);
      featureObservers.push(archObs);
    }

    // 3. Agent Ecosystem cards reveal
    const agentItems = agentItemRefs.current.filter(Boolean) as HTMLDivElement[];
    agentItems.forEach((item) => {
      gsap.set(item, { opacity: 0, y: 30 });
    });

    const agentsObs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const idx = agentItems.indexOf(entry.target as HTMLDivElement);
          gsap.to(entry.target, {
            opacity: 1,
            y: 0,
            duration: 0.8,
            delay: (idx % 4) * 0.1,
            ease: 'power2.out',
          });
          agentsObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    agentItems.forEach((item) => agentsObs.observe(item));
    featureObservers.push(agentsObs);

    return () => {
      featureObservers.forEach((obs) => obs.disconnect());
    };
  }, []);

  return (
    <div style={{ color: '#F0F4FF', minHeight: '100vh', marginTop: '-40px' }}>
      
      {/* ============================================================
          HERO SECTION
          ============================================================ */}
      <section
        id="hero"
        className="relative w-full overflow-hidden flex flex-col justify-between"
        style={{ height: '90vh', padding: '16vh 0 6vh' }}
      >
        <AmberCascades />
        <div className="relative z-10 flex flex-col justify-between h-full">
          <div>
            {/* Eyebrow */}
            <div
              className="mb-6 flex items-center gap-2"
              style={{
                fontFamily: "'Space Grotesk', monospace",
                fontSize: 12,
                fontWeight: 400,
                letterSpacing: 3,
                textTransform: 'uppercase',
                color: '#1E6AFF',
              }}
            >
              <Zap size={14} />
              Sui Overflow 2026 Hackathon
            </div>

            <h1
              ref={titleRef}
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 500,
                fontSize: 'clamp(44px, 6.5vw, 84px)',
                lineHeight: 1.05,
                letterSpacing: '-2px',
                marginBottom: '28px',
                width: 'fit-content',
                background: 'linear-gradient(135deg, #FFF 20%, #A3C4FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Safe Spending
              <br />
              for AI Agents
            </h1>

            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 300,
                fontSize: 'clamp(15px, 1.4vw, 18px)',
                lineHeight: 1.65,
                color: '#A3B3CC',
                marginBottom: '40px',
                width: titleWidth ? Math.min(titleWidth, 540) : 'auto',
                maxWidth: '100%',
              }}
            >
              First-of-its-kind on-chain wallet protocol for autonomous agents. Scoped vaults with strict spending limits, DeFi recipient whitelists, and emergency kill switches — atomically enforced by Move contracts on Sui.
            </p>
          </div>

          {/* CTA / Wallet Connect Console access */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 relative z-20">
            <div className="glass-panel" style={{
              padding: '16px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              border: '1px solid rgba(30, 106, 255, 0.25)',
              background: 'rgba(6, 16, 37, 0.4)',
              boxShadow: '0 0 30px rgba(30, 106, 255, 0.08)',
              borderRadius: '16px',
              maxWidth: '420px',
            }}>
              <span style={{ fontSize: '0.85rem', color: '#A3B3CC', fontWeight: 300 }}>
                Ready to delegate guardrails? Authenticate with your Sui wallet:
              </span>
              <div className="flex items-center gap-3">
                <ConnectButton className="sui-connect-btn" />
                <span style={{ fontSize: '0.75rem', color: '#5E6E85', fontFamily: "'Space Grotesk', monospace" }}>
                  Devnet / Testnet
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '14px 28px',
                borderRadius: 10,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.02)',
                color: '#F0F4FF',
                fontFamily: "'Space Grotesk', monospace",
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(30, 106, 255, 0.5)';
                e.currentTarget.style.background = 'rgba(30, 106, 255, 0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
              }}
            >
              Explore Capabilities <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <span style={{ fontSize: '10px', color: '#5E6E85', letterSpacing: 2, textTransform: 'uppercase', fontFamily: "'Space Grotesk', monospace" }}>
            Scroll
          </span>
          <div style={{ width: 1, height: 32, background: 'rgba(94, 110, 133, 0.3)', position: 'relative', overflow: 'hidden' }}>
            <div style={{
              width: 3,
              height: 8,
              borderRadius: '50%',
              background: '#1E6AFF',
              position: 'absolute',
              left: -1,
              animation: 'scrollDot 2s ease-in-out infinite',
            }} />
          </div>
          <style>{`
            @keyframes scrollDot {
              0%, 100% { top: 0; opacity: 0; }
              50% { top: 24px; opacity: 1; }
            }
          `}</style>
        </div>
      </section>

      {/* ============================================================
          FEATURES / CAPABILITIES SECTION
          ============================================================ */}
      <section
        id="features"
        ref={featuresRef}
        className="relative"
        style={{ padding: '100px 0', zIndex: 2 }}
      >
        <div className="mb-6 flex items-center justify-between">
          <div
            style={{
              fontFamily: "'Space Grotesk', monospace",
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: '3px',
              textTransform: 'uppercase',
              color: '#5E6E85',
            }}
          >
            Capabilities & Safeguards
          </div>
          <div style={{ height: 1, flex: 1, background: 'rgba(94, 110, 133, 0.15)', marginLeft: 24 }} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6" style={{ marginTop: 40 }}>
          {CAPABILITIES.map((cap, i) => (
            <div
              key={cap.title}
              ref={(el) => { featureItemRefs.current[i] = el; }}
              className="relative overflow-hidden group cursor-pointer"
              style={{
                borderRadius: 12,
                aspectRatio: '3/4',
                transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.5s ease',
                transform: hoveredFeature === i ? 'translateY(-6px)' : 'translateY(0)',
                boxShadow: hoveredFeature === i
                  ? '0 20px 40px rgba(30, 106, 255, 0.12)'
                  : '0 4px 20px rgba(0,0,0,0.4)',
                border: hoveredFeature === i ? '1px solid rgba(30, 106, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.05)',
              }}
              onMouseEnter={() => setHoveredFeature(i)}
              onMouseLeave={() => setHoveredFeature(null)}
            >
              {/* Background image placeholder / generation */}
              <div className="absolute inset-0 w-full h-full bg-slate-900">
                <img
                  src={cap.image}
                  alt={cap.title}
                  className="w-full h-full object-cover transition-transform duration-700"
                  style={{
                    transform: hoveredFeature === i ? 'scale(1.06)' : 'scale(1)',
                    filter: hoveredFeature === i ? 'grayscale(0%) brightness(0.6)' : 'grayscale(50%) brightness(0.4)',
                  }}
                />
              </div>

              {/* Glowing overlay */}
              <div
                className="absolute inset-0 transition-opacity duration-500"
                style={{
                  background: 'linear-gradient(to top, rgba(2,4,10,0.98) 0%, rgba(2,4,10,0.5) 60%, rgba(2,4,10,0.2) 100%)',
                }}
              />

              {/* Card Badge Icon */}
              <div className="absolute top-6 left-6 z-10 w-10 h-10 rounded-lg flex items-center justify-center" style={{
                background: hoveredFeature === i ? 'rgba(30, 106, 255, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                border: hoveredFeature === i ? '1px solid rgba(30, 106, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                transition: 'all 0.3s ease',
              }}>
                {i === 0 && <Shield size={18} color={hoveredFeature === i ? '#1E6AFF' : '#A3B3CC'} />}
                {i === 1 && <Activity size={18} color={hoveredFeature === i ? '#1E6AFF' : '#A3B3CC'} />}
                {i === 2 && <ShieldAlert size={18} color={hoveredFeature === i ? '#ef4444' : '#A3B3CC'} />}
              </div>

              {/* Content panel */}
              <div
                className="absolute bottom-0 left-0 right-0 z-10"
                style={{
                  padding: '32px 24px',
                  transform: hoveredFeature === i ? 'translateY(0)' : 'translateY(8px)',
                  transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <h3
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 500,
                    fontSize: '1.6rem',
                    lineHeight: 1.2,
                    color: '#F0F4FF',
                    margin: '0 0 12px 0',
                    letterSpacing: '-0.5px',
                  }}
                >
                  {cap.title}
                </h3>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 300,
                    fontSize: '0.9rem',
                    lineHeight: 1.6,
                    color: '#A3B3CC',
                    margin: 0,
                    maxHeight: hoveredFeature === i ? '160px' : '76px',
                    overflow: 'hidden',
                    transition: 'max-height 0.4s ease',
                  }}
                >
                  {cap.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================
          CINEMATIC VISION (VIDEO SHOWCASE)
          ============================================================ */}
      <section
        id="architecture"
        ref={architectureRef}
        className="relative"
        style={{ padding: '100px 0', zIndex: 2 }}
      >
        <div className="mb-6 flex items-center justify-between">
          <div
            style={{
              fontFamily: "'Space Grotesk', monospace",
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: '3px',
              textTransform: 'uppercase',
              color: '#5E6E85',
            }}
          >
            On-Chain Architecture
          </div>
          <div style={{ height: 1, flex: 1, background: 'rgba(94, 110, 133, 0.15)', marginLeft: 24 }} />
        </div>

        <div className="relative mt-12">
          {/* Looping video container */}
          <div
            className="relative overflow-hidden"
            style={{
              width: '100%',
              aspectRatio: '21/9',
              borderRadius: 12,
              border: '1px solid rgba(30, 106, 255, 0.15)',
              boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
              background: '#02040A',
            }}
          >
            <video
              ref={videoRef}
              src="/videos/cinematic-vision.mp4"
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-cover"
              style={{ display: 'block', filter: 'brightness(0.65) contrast(1.05) hue-rotate(200deg)' }}
            />
            {/* Ambient vignette */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'radial-gradient(circle at center, transparent 30%, rgba(2, 4, 10, 0.8) 100%)'
            }} />
          </div>

          <div
            ref={archTextRef}
            className="flex flex-col md:flex-row md:items-start"
            style={{ marginTop: 80, gap: '48px' }}
          >
            <h2
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 500,
                fontSize: 'clamp(28px, 4vw, 44px)',
                lineHeight: 1.15,
                letterSpacing: '-1px',
                color: '#F0F4FF',
                margin: 0,
                flex: '0 0 50%',
              }}
            >
              Built for Sui,
              <br />
              Enforced by Move.
            </h2>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 300,
                fontSize: '1rem',
                lineHeight: 1.8,
                color: '#A3B3CC',
                margin: 0,
                flex: '1 1 50%',
              }}
            >
              SuiVault is engineered to harness Sui's unique object-centric framework. Vaults operate as first-class on-chain objects owned by users. Access keys are represented as delegated dynamic capabilities that are scoped atomically within Programmable Transaction Blocks (PTBs). By integrating verification gates directly at the VM level, transactions bypass heavy off-chain consensus bottlenecks, securing sub-second execution speeds.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================
          AGENT ECOSYSTEM GRID
          ============================================================ */}
      <section
        id="agents"
        ref={agentsRef}
        style={{ padding: '100px 0', zIndex: 2 }}
      >
        <div className="mb-6 flex items-center justify-between">
          <div
            style={{
              fontFamily: "'Space Grotesk', monospace",
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: '3px',
              textTransform: 'uppercase',
              color: '#5E6E85',
            }}
          >
            Compatible Swarms & Integrations
          </div>
          <div style={{ height: 1, flex: 1, background: 'rgba(94, 110, 133, 0.15)', marginLeft: 24 }} />
        </div>

        <div
          className="grid grid-cols-2 md:grid-cols-4 mt-12"
          style={{ borderTop: '1px solid rgba(94, 110, 133, 0.15)', borderLeft: '1px solid rgba(94, 110, 133, 0.15)' }}
        >
          {AGENTS.map((agent, i) => (
            <div
              key={`${agent.title}-${i}`}
              ref={(el) => { agentItemRefs.current[i] = el; }}
              className="group cursor-pointer transition-all duration-300"
              style={{
                borderBottom: '1px solid rgba(94, 110, 133, 0.15)',
                borderRight: '1px solid rgba(94, 110, 133, 0.15)',
                padding: '28px 24px',
                background: 'rgba(255, 255, 255, 0.01)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(30, 106, 255, 0.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)';
              }}
            >
              <div
                className="relative overflow-hidden mb-4"
                style={{ aspectRatio: '1/1', borderRadius: 8 }}
              >
                <img
                  src={agent.image}
                  alt={agent.title}
                  className="w-full h-full object-cover transition-all duration-500"
                  style={{
                    opacity: 0.4,
                    filter: 'grayscale(100%)',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget;
                    el.style.opacity = '0.95';
                    el.style.filter = 'grayscale(0%) hue-rotate(200deg)';
                    el.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget;
                    el.style.opacity = '0.4';
                    el.style.filter = 'grayscale(100%)';
                    el.style.transform = 'scale(1)';
                  }}
                />
              </div>
              <h4
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 500,
                  fontSize: '1.05rem',
                  color: '#F0F4FF',
                  margin: '0 0 6px 0',
                  lineHeight: 1.3,
                }}
              >
                {agent.title}
              </h4>
              <div className="flex items-center justify-between">
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 300,
                    fontSize: 12,
                    color: '#5E6E85',
                  }}
                >
                  {agent.category}
                </span>
                <span
                  style={{
                    fontFamily: "'Space Grotesk', monospace",
                    fontWeight: 400,
                    fontSize: 11,
                    color: '#5E6E85',
                    opacity: 0.5,
                  }}
                >
                  {agent.year}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================
          FOOTER SECTION
          ============================================================ */}
      <footer
        id="footer"
        style={{
          padding: '100px 0 40px',
          zIndex: 2,
          borderTop: '1px solid rgba(94, 110, 133, 0.15)',
        }}
      >
        <h2
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 500,
            fontSize: 'clamp(32px, 5vw, 60px)',
            lineHeight: 1.15,
            letterSpacing: '-1.5px',
            background: 'linear-gradient(90deg, #fff 0%, #a3c4ff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 60,
          }}
        >
          Secure Every Agent Swarm.
        </h2>

        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-8"
          style={{ marginBottom: 80 }}
        >
          <div className="flex flex-col gap-4">
            <span style={{
              fontFamily: "'Space Grotesk', monospace",
              fontSize: 11,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: '#5E6E85',
              fontWeight: 500,
            }}>
              Move Contracts
            </span>
            {['SuiVault.move', 'Policy.move', 'AuditLog.move', 'Registry.move'].map(text => (
              <span key={text} style={{ fontSize: '0.85rem', color: '#A3B3CC', cursor: 'pointer' }}>{text}</span>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <span style={{
              fontFamily: "'Space Grotesk', monospace",
              fontSize: 11,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: '#5E6E85',
              fontWeight: 500,
            }}>
              Off-Chain Storage
            </span>
            {['Walrus MemWal Logs', 'Event Indexer', 'Audit Proofs', 'Verification Gate'].map(text => (
              <span key={text} style={{ fontSize: '0.85rem', color: '#A3B3CC', cursor: 'pointer' }}>{text}</span>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <span style={{
              fontFamily: "'Space Grotesk', monospace",
              fontSize: 11,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: '#5E6E85',
              fontWeight: 500,
            }}>
              Hackathon Info
            </span>
            <span style={{ fontSize: '0.85rem', color: '#A3B3CC' }}>Sui Overflow 2026</span>
            <span style={{ fontSize: '0.85rem', color: '#A3B3CC' }}>Track: Agentic Web</span>
            <span style={{ fontSize: '0.85rem', color: '#A3B3CC' }}>Status: Production Ready</span>
          </div>

          <div className="flex flex-col gap-4">
            <span style={{
              fontFamily: "'Space Grotesk', monospace",
              fontSize: 11,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: '#5E6E85',
              fontWeight: 500,
            }}>
              Ecosystem
            </span>
            <span style={{ fontSize: '0.85rem', color: '#A3B3CC', cursor: 'pointer' }}>Sui Foundation</span>
            <span style={{ fontSize: '0.85rem', color: '#A3B3CC', cursor: 'pointer' }}>Cetus AMM Whitelist</span>
            <span style={{ fontSize: '0.85rem', color: '#A3B3CC', cursor: 'pointer' }}>DeepBook L3 Whitelist</span>
          </div>
        </div>

        <div
          className="flex flex-col md:flex-row items-center justify-between"
          style={{
            paddingTop: 24,
            borderTop: '1px solid rgba(94, 110, 133, 0.12)',
            gap: 16,
          }}
        >
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 300,
              fontSize: 12,
              color: '#5E6E85',
            }}
          >
            &copy; 2026 SuiVault Protocol. Built for Sui Overflow 2026.
          </span>
          <div className="flex items-center gap-6">
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#5E6E85', cursor: 'pointer' }}>Privacy Policy</span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#5E6E85', cursor: 'pointer' }}>Terms of Service</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
