"""
SuiVault — Hackathon Demo Driver (Sui Overflow 2026)
=====================================================
Cinematic 5-minute demo with voiceover-ready structure.
Tracks: Agentic Web · DeepBook · Walrus

[ignoring loop detection]

NARRATIVE ARC:
  ACT 1  (0:00–0:25)  THE HOOK         — Problem + landing page beauty shot
  ACT 2  (0:25–1:10)  AUTHENTICATE     — zkLogin / Wallet Connection
  ACT 3  (1:10–2:10)  VAULT CREATION   — Create vault wizard + DeepBook Preset
  ACT 4  (2:10–3:20)  AGENT EXECUTION  — AI Guardian + guarded spend + Suiscan
  ACT 5  (3:20–4:05)  TRUST & VERIFY   — Activity feed + Walrus audit
  ACT 6  (4:05–4:45)  EMERGENCY RESPONSE — Kill switch + Suiscan
  ACT 7  (4:45–5:00)  CLOSING          — Return home + final branding

USAGE:
  cd dashboard && npm run dev          (terminal 1)
  python demo_driver.py                (terminal 2)
"""

import asyncio, json, os, random, sys, time, urllib.request
from pathlib import Path

try:
    from playwright.async_api import async_playwright
except ModuleNotFoundError:
    print("Run: pip install playwright && python -m playwright install chromium")
    sys.exit(1)

# ── Mode Selection ──────────────────────────────────────────────────
# Set this to True to run with a real testnet wallet and real transactions.
# Set this to False to run in local mock/sandbox mode.
USE_REAL_TESTNET = os.getenv("USE_REAL_TESTNET", "1") in {"1", "true"}

# Configure your real Testnet details here:
REAL_AGENT_ADDRESS = os.getenv("REAL_AGENT_ADDRESS", "0x2ccfc4adb3477a9ca54e26ef86faf33d2b429b8535d70cb61ba102746e857b1d")
REAL_RECIPIENT = os.getenv("REAL_RECIPIENT", "0xdeeb000000000000000000000000000000000000000000000000000000000000")

# Paths for persistent Chrome profile connection (required for wallet extension)
USER_DATA_DIR = os.path.expanduser(os.getenv("CHROME_USER_DATA_DIR", "~/.config/google-chrome"))
CHROME_PROFILE = os.getenv("CHROME_PROFILE", "Default")

# ── Config ──────────────────────────────────────────────────────────
DASHBOARD_URL = os.getenv("SUIVAULT_DASHBOARD_URL", "http://localhost:3000")
PACKAGE_ID = "0x76e4f4311ea9c7cafeb45ad5817e784887e7021ac4595b3e6baf514cf3e725b9"
HEADLESS = os.getenv("DEMO_HEADLESS", "0") in {"1", "true"}
SLOW_MO = int(os.getenv("DEMO_SLOW_MO_MS", "40"))
CHROME = "/usr/bin/google-chrome"

# ── Helpers ─────────────────────────────────────────────────────────

async def pause(s: float):
    await asyncio.sleep(max(0, s + random.uniform(-0.15, 0.25)))


async def narrate(act: str, timestamp: str, title: str, voiceover: str):
    """Print structured narration cues for the voiceover script."""
    print(f"\n{'─'*60}")
    print(f"  [{timestamp}]  {act} — {title}")
    print(f"  🎙️  \"{voiceover}\"")
    print(f"{'─'*60}")


async def human_type(page, selector, text, delay_min=35, delay_max=80):
    try:
        await page.wait_for_selector(selector, state="visible", timeout=8000)
        await page.click(selector)
        mod = "Meta" if sys.platform == "darwin" else "Control"
        await page.keyboard.press(f"{mod}+A")
        await page.keyboard.press("Backspace")
        for ch in text:
            await page.keyboard.type(ch, delay=random.randint(delay_min, delay_max))
        await pause(0.5)
    except Exception as e:
        print(f"  [!] type failed on {selector}: {e}")


async def smooth_scroll(page, px=400, speed=0.12):
    done = 0
    while done < px:
        step = random.randint(80, 180)
        await page.mouse.wheel(0, step)
        done += step
        await pause(speed)


async def safe_goto(page, url, timeout=60000):
    for attempt in range(2):
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
            await page.wait_for_load_state("networkidle", timeout=timeout)
            return
        except Exception:
            if attempt == 0:
                print(f"  [!] nav retry → {url}")
    await page.goto(url, wait_until="load", timeout=timeout)


async def click_if_visible(page, selector, label="button", wait=2.0):
    """Click a button if visible, return True if clicked."""
    el = page.locator(selector).first
    try:
        if await el.is_visible(timeout=3000):
            await el.click()
            await pause(wait)
            print(f"  ✓ Clicked: {label}")
            return True
    except Exception:
        pass
    print(f"  · Skipped: {label} (not visible)")
    return False


async def wait_for_wallet_signature(page, success_text="Transaction complete", error_text="rejected"):
    """
    Wait for the user to approve the transaction in their wallet extension.
    Checks the UI dynamically for success or failure states.
    """
    print("\n  👉 [ACTION REQUIRED] Real transaction triggered! Please check your wallet extension and click APPROVE.")
    print("  ⌛ Waiting for approval...")
    
    # We poll the page for success/error elements
    for _ in range(60): # 60 seconds timeout
        content = await page.content()
        if success_text.lower() in content.lower() or "transaction complete" in content.lower() or "success" in content.lower():
            print("  ✓ Transaction signature detected and executed successfully on Testnet!")
            await pause(2.0)
            return True
        if error_text.lower() in content.lower() or "rejected" in content.lower() or "cancelled" in content.lower():
            print("  ❌ Transaction rejected or cancelled by user.")
            return False
        await asyncio.sleep(1.0)
    print("  ⚠️ Wallet signature wait timed out.")
    return False


async def open_suiscan_for_latest_tx(page, ctx):
    """Retrieves the latest transaction digest from localStorage and opens it on Suiscan."""
    # Wait briefly for storage to update
    await asyncio.sleep(1.5)
    digest = await page.evaluate("""() => {
        try {
            const stored = localStorage.getItem("recent_transactions");
            if (stored) {
                const txs = JSON.parse(stored);
                if (txs.length > 0) return txs[0].digest;
            }
        } catch(e) {}
        return null;
    }""")
    
    if digest:
        print(f"  → Found transaction digest: {digest}")
        print(f"  🎙️ [EXPLORER] Opening Suiscan for transaction {digest}...")
        suiscan_page = await ctx.new_page()
        # Bring it to front
        await suiscan_page.bring_to_front()
        # Load the tx explorer
        await safe_goto(suiscan_page, f"https://suiscan.xyz/testnet/tx/{digest}")
        # Allow time to see the transaction status
        await pause(8.0)
        # Close the explorer tab to return
        await suiscan_page.close()
        # Bring main page back to front
        await page.bring_to_front()
    else:
        print("  · No transaction digest found in history to display on explorer.")


def check_server_online(url):
    """Verify that the dashboard server is responding before starting playwright."""
    try:
        # We perform a simple HTTP request with a 2-second timeout
        urllib.request.urlopen(url, timeout=2.0)
        return True
    except Exception:
        return False


# ── Demo Data Seeding ───────────────────────────────────────────────

def _demo_vaults():
    now = int(time.time() * 1000)
    return [
        {
            "id": "demo-vault-arbitrage",
            "name": "DeFi Arbitrage Agent (Demo)",
            "owner": "0x142df8eaa1bfa7554bc9a71d9105f5a4b039e66ea5e55ea4b38bcb83cb684dc0",
            "balance": "450500000000",
            "todaySpent": "35000000000",
            "totalSpent": "1205000000000",
            "agentKeyId": "demo-key-arbitrage",
            "isFrozen": False,
            "createdAtMs": now - 10 * 86400000,
            "lastResetMs": now,
            "policy": {
                "maxPerTx": "50000000000",
                "maxPerDay": "100000000000",
                "allowedRecipients": ["0xdeeb000000000000000000000000000000000000000000000000000000000000"],
                "activeHoursStart": 0, "activeHoursEnd": 0,
                "isDeepbookOnly": False,
                "deepbookPool": "0x" + "0" * 64,
                "maxPrice": "0", "minPrice": "0",
            },
        },
    ]


async def seed(page):
    # Only seed mock items if we aren't executing real testnet transactions
    if USE_REAL_TESTNET:
        # In real mode, we do NOT seed zklogin_user at all.
        # This allows the connect wallet button to render so you can connect your wallet.
        print("  🔧 Seeding environment: REAL Testnet mode. No mock zkLogin injected.")
        await page.add_init_script("""(() => {
            window.localStorage.removeItem('zklogin_user');
        })();""")
    else:
        print("  🔧 Seeding environment: MOCK Sandbox mode.")
        user = {
            "email": "judge@overflow.demo",
            "name": "Sui Overflow Judge",
            "address": "0x142df8eaa1bfa7554bc9a71d9105f5a4b039e66ea5e55ea4b38bcb83cb684dc0",
            "provider": "Mock zkLogin",
            "isMock": True,
        }
        txns = [
            {"digest": "0xdemo_vault_setup_7f9c2a",
             "description": "Vault creation + VaultKey issuance",
             "timestamp": int(time.time() * 1000)},
            {"digest": "0xdemo_guardian_spend_a1b2c3",
             "description": "AI Risk Guardian approved spend",
             "timestamp": int(time.time() * 1000) - 30000},
            {"digest": "0xdemo_walrus_audit_d4e5f6",
             "description": "Walrus audit log uploaded",
             "timestamp": int(time.time() * 1000) - 60000},
        ]
        await page.add_init_script(f"""(() => {{
            window.localStorage.setItem('zklogin_user', JSON.stringify({json.dumps(user)}));
            window.localStorage.setItem('suivault_local_created_vaults', JSON.stringify({json.dumps(_demo_vaults())}));
            window.localStorage.setItem('recent_transactions', JSON.stringify({json.dumps(txns)}));
        }})();""")


# ════════════════════════════════════════════════════════════════════
#  7-ACT DEMO
# ════════════════════════════════════════════════════════════════════

async def run_demo():
    print("=" * 60)
    print("  SUIVAULT — Hackathon Demo (Sui Overflow 2026)")
    print("  Tracks: Agentic Web · DeepBook · Walrus")
    print(f"  Mode    : {'REAL TESTNET' if USE_REAL_TESTNET else 'LOCAL MOCK'}")
    print("=" * 60)
    print(f"  Dashboard : {DASHBOARD_URL}")
    print(f"  Package   : {PACKAGE_ID}")
    
    # Pre-flight check: Make sure dashboard is running
    print(f"  🔍 Checking if dashboard is running at {DASHBOARD_URL}...")
    if not check_server_online(DASHBOARD_URL):
        print(f"  ❌ ERROR: The dashboard server is offline!")
        print(f"     Please run: 'cd ~/suivault/dashboard && npm run dev' in another terminal.")
        sys.exit(1)
    print("  ✓ Dashboard server detected online!")

    if USE_REAL_TESTNET:
        print(f"  Chrome Profile Data : {USER_DATA_DIR} ({CHROME_PROFILE})")
        print("  ⚠️  IMPORTANT: Please close all Google Chrome windows before running this to avoid lock errors!")
    print("  ▶  Start screen recording NOW. Automation in 4s...\n")
    await asyncio.sleep(4)

    async with async_playwright() as p:
        # Launching with persistent context loads the user's extension (Sui Wallet)
        if USE_REAL_TESTNET:
            print("  → Launching with persistent Chrome context...")
            ctx = await p.chromium.launch_persistent_context(
                user_data_dir=USER_DATA_DIR,
                headless=False, # Extensions must run in non-headless mode
                slow_mo=SLOW_MO,
                executable_path=CHROME,
                args=[
                    "--start-maximized", 
                    "--no-sandbox",
                    "--disable-infobars",
                    f"--profile-directory={CHROME_PROFILE}"
                ],
                no_viewport=True
            )
            page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        else:
            print("  → Launching clean browser...")
            browser = await p.chromium.launch(
                headless=HEADLESS, slow_mo=SLOW_MO,
                executable_path=CHROME,
                args=[
                    "--start-maximized", 
                    "--no-sandbox",
                    "--disable-infobars",
                    "--window-size=1920,1080"
                ],
            )
            ctx = await browser.new_context(no_viewport=True)
            page = await ctx.new_page()

        await seed(page)

        # ──────────────────────────────────────────────────────────
        # ACT 1: THE HOOK  (0:00 – 0:25)
        # ──────────────────────────────────────────────────────────
        await narrate(
            "ACT 1", "0:00", "THE HOOK",
            "AI agents are trading billions in crypto — but they hold "
            "unrestricted private keys. One rogue trade can drain "
            "everything. SuiVault changes that."
        )
        await safe_goto(page, DASHBOARD_URL)
        # Let the hero animation play
        await pause(4)
        print("  → Hero section visible: headline + particle animation")

        # Slow scroll to tease the vault console below
        await smooth_scroll(page, 350, 0.2)
        await pause(2)

        # ──────────────────────────────────────────────────────────
        # ACT 2: AUTHENTICATE + CONSOLE  (0:25 – 1:10)
        # ──────────────────────────────────────────────────────────
        await narrate(
            "ACT 2", "0:25", "AUTHENTICATE & CONSOLE",
            "Users sign in with zkLogin or securely connect their "
            "on-chain wallet. The dashboard immediately "
            "shows all active, on-chain agent vaults."
        )
        
        # Connect wallet automatically if in real testnet mode
        if USE_REAL_TESTNET:
            # Look for the Connect Wallet button
            connect_btn = page.locator("button:has-text('Connect Wallet'), .sui-connect-btn").first
            if await connect_btn.is_visible(timeout=3000):
                print("  → Clicking Connect Wallet...")
                await connect_btn.click()
                await pause(1.5)
                
                # Check for the wallet selection popup and select Sui Wallet
                sui_wallet_selector = "button:has-text('Sui Wallet')"
                sui_wallet_btn = page.locator(sui_wallet_selector).first
                if await sui_wallet_btn.is_visible(timeout=3000):
                    print("  → Selecting Sui Wallet from prompt...")
                    await sui_wallet_btn.click()
                    await pause(3.0)
            
            print("  👉 [ACTION] Ensure your browser wallet connects successfully. Pausing 5s...")
            await pause(5.0)

        # Scroll down to the console section
        await smooth_scroll(page, 450, 0.15)
        await pause(2)

        # ──────────────────────────────────────────────────────────
        # ACT 3: VAULT CREATION  (1:10 – 2:10)
        # ──────────────────────────────────────────────────────────
        await narrate(
            "ACT 3", "1:10", "VAULT CREATION",
            "Let's deploy a new on-chain vault for our AI trading agent. "
            "We navigate to the wizard, define the vault properties, and "
            "deposit initial SUI funding."
        )
        
        # Navigate to create page
        create_url = f"{DASHBOARD_URL}/create"
        await safe_goto(page, create_url)
        await pause(2.5)

        # --- STEP 1 ---
        print("  → Filling Step 1: Core Details...")
        await human_type(page, 'input[placeholder="e.g. DeFi Trading Co-Pilot"]', "DeFi Arbitrage Agent (Real)")
        await human_type(page, 'input[placeholder="1.0"]', "0.5") # Deposit 0.5 SUI
        await pause(1.0)
        await click_if_visible(page, "button:has-text('Continue')", "Continue to Step 2", 1.5)

        # --- STEP 2 ---
        print("  → Filling Step 2: Assign Agent...")
        await human_type(page, 'input[placeholder="Recipient address of the AI bot"]', REAL_AGENT_ADDRESS)
        await human_type(page, 'input[placeholder="e.g. Sentinel-1"]', "Arbitrage-Bot-1")
        await pause(1.0)
        await click_if_visible(page, "button:has-text('Continue')", "Continue to Step 3", 1.5)

        # --- STEP 3 ---
        print("  → Filling Step 3: Guardrail Preset...")
        # Select DeepBook preset
        await click_if_visible(page, "button:has-text('DeepBook')", "Select DeepBook Template Preset", 1.5)
        # Scroll to show details
        await smooth_scroll(page, 200, 0.15)
        await pause(1.0)
        await click_if_visible(page, "button:has-text('Continue')", "Continue to Step 4", 1.5)

        # --- STEP 4 ---
        print("  → Step 4: Confirming deployment...")
        await pause(1.5)
        
        await narrate(
            "ACT 3b", "1:45", "SIGN VAULT CREATION",
            "We confirm our vault rules and sign the transaction block. "
            "This creates the vault and issues the scoped VaultKey to the agent address."
        )

        submitted_create = await click_if_visible(
            page, "button:has-text('Sign & Create Vault')",
            "Sign & Create Vault", 2
        )
        
        real_vault_id = None
        if submitted_create and USE_REAL_TESTNET:
            sig_success = await wait_for_wallet_signature(page)
            if sig_success:
                # Open on explorer
                await open_suiscan_for_latest_tx(page, ctx)
                # Fetch new vault ID from localStorage
                await pause(2.0)
                real_vault_id = await page.evaluate("""() => {
                    try {
                        const stored = localStorage.getItem("suivault_local_created_vaults");
                        if (stored) {
                            const list = JSON.parse(stored);
                            if (list.length > 0) return list[0].id;
                        }
                    } catch(e) {}
                    return null;
                }""")

        # Fallback to config if creation was cancelled or local sandbox mode
        if not real_vault_id:
            real_vault_id = REAL_VAULT_ID if USE_REAL_TESTNET else "demo-vault-arbitrage"
            
        print(f"  → Using Vault ID: {real_vault_id}")
        await pause(2.0)

        # ──────────────────────────────────────────────────────────
        # ACT 4: AGENT EXECUTION + AI GUARDIAN  (2:10 – 3:20)
        # ──────────────────────────────────────────────────────────
        await narrate(
            "ACT 4", "2:10", "AGENT EXECUTION",
            "Now the agent's perspective. The Agent Console is where "
            "AI agents submit spend intents. Every intent passes "
            "through our AI Risk Guardian — a pre-flight safety check "
            "that evaluates policy compliance BEFORE signing."
        )
        
        agent_target_url = f"{DASHBOARD_URL}/agent?strategy=arbitrage"
        await safe_goto(page, agent_target_url)
        await pause(3.5)

        # Highlight the strategy selector by clicking through strategies
        for slug in ["meme", "liquidation", "arbitrage"]:
            btn = page.locator(f"button:has-text('{slug.title()}')").first
            try:
                if await btn.is_visible(timeout=2000):
                    await btn.click()
                    await pause(0.8)
            except Exception:
                pass

        await narrate(
            "ACT 4b", "2:40", "SPEND SIMULATION",
            "Let's submit a transaction. The agent wants to send SUI "
            "tokens to a whitelisted destination. The AI Guardian runs "
            "risk analysis, uploads audit data to Walrus, and triggers "
            "the spend execution."
        )

        # Select target key if present
        key_list_items = page.locator("div.glass-panel button:has-text('Use Key')")
        if await key_list_items.count() > 0:
            await key_list_items.first.click()
            await pause(1.5)

        # Type recipient address
        recipient_input = page.locator('input[placeholder="0x..."]').first
        try:
            if await recipient_input.is_visible(timeout=3000):
                target_address = REAL_RECIPIENT if USE_REAL_TESTNET else "0xdeeb000000000000000000000000000000000000000000000000000000000000"
                await human_type(page, 'input[placeholder="0x..."]', target_address)
                print(f"  → Typed recipient: {target_address[:10]}...")
        except Exception:
            print("  · Recipient input not ready")

        amount_input = page.locator('input[placeholder="0.1"]')
        try:
            if await amount_input.is_visible(timeout=3000):
                amount_value = "0.01" if USE_REAL_TESTNET else "0.8"
                await human_type(page, 'input[placeholder="0.1"]', amount_value)
                print(f"  → Typed amount: {amount_value} SUI")
        except Exception:
            print("  · Amount input not ready")

        await pause(1.5)

        # Click submit
        submitted = await click_if_visible(
            page, "button:has-text('Submit Spend Transaction')",
            "Submit Spend Transaction", 2
        )
        
        if submitted and USE_REAL_TESTNET:
            # Wait for user to sign on extension
            sig_success = await wait_for_wallet_signature(page)
            if sig_success:
                # Open on explorer
                await open_suiscan_for_latest_tx(page, ctx)

        # Scroll to show results
        await smooth_scroll(page, 200, 0.15)
        await pause(2)

        # ──────────────────────────────────────────────────────────
        # ACT 5: TRUST & VERIFY — WALRUS AUDIT  (3:20 – 4:05)
        # ──────────────────────────────────────────────────────────
        await narrate(
            "ACT 5", "3:20", "TRUST & VERIFY — WALRUS AUDIT",
            "Back in the vault — every transaction is logged on-chain "
            "with a Walrus blob ID. Expand any entry to see the AI "
            "agent's reasoning, stored immutably on decentralized "
            "storage. This is the audit trail."
        )
        vault_target_url = f"{DASHBOARD_URL}/vault/{real_vault_id}"
        await safe_goto(page, vault_target_url)
        await pause(3.0)

        # Scroll past the policy editor to the activity feed
        await smooth_scroll(page, 900, 0.12)
        await pause(2)

        # Expand Walrus reasoning blobs
        walrus_buttons = page.locator("button:has-text('Show Agent Reasoning')")
        count = await walrus_buttons.count()
        for i in range(min(count, 2)):
            try:
                btn = walrus_buttons.nth(i)
                if await btn.is_visible(timeout=2000):
                    await btn.click()
                    await pause(2.5)
                    print(f"  → Expanded Walrus reasoning blob #{i+1}")
            except Exception:
                pass

        await pause(2)

        # ──────────────────────────────────────────────────────────
        # ACT 6: EMERGENCY RESPONSE  (4:05 – 4:45)
        # ──────────────────────────────────────────────────────────
        await narrate(
            "ACT 6", "4:05", "EMERGENCY RESPONSE",
            "What if an agent goes rogue? The owner has an emergency "
            "kill switch — one click freezes ALL spending at the smart "
            "contract level. No off-chain coordination needed."
        )
        
        # Scroll up to the actions section
        await page.evaluate("window.scrollTo({ top: 400, behavior: 'smooth' })")
        await pause(1.5)

        # Freeze vault
        clicked = await click_if_visible(
            page, "button:has-text('FREEZE VAULT NOW')",
            "FREEZE VAULT NOW", 1.5
        )
        if clicked:
            confirm_clicked = await click_if_visible(
                page, "button:has-text('Confirm Freeze')",
                "Confirm Freeze", 2
            )
            if confirm_clicked and USE_REAL_TESTNET:
                sig_success = await wait_for_wallet_signature(page)
                if sig_success:
                    # Open on explorer
                    await open_suiscan_for_latest_tx(page, ctx)
            print("  → Emergency freeze triggered")

        # Hold on the frozen state
        await page.evaluate("window.scrollTo({ top: 0, behavior: 'smooth' })")
        await pause(3)

        # ──────────────────────────────────────────────────────────
        # ACT 7: CLOSING  (4:45 – 5:00)
        # ──────────────────────────────────────────────────────────
        await narrate(
            "ACT 7", "4:45", "CLOSING",
            "SuiVault — the first on-chain wallet protocol for AI "
            "agents. Scoped vaults, Move-enforced policies, DeepBook "
            "integration, Walrus audit trails, and emergency kill "
            "switches. Built for Sui Overflow 2026."
        )
        await safe_goto(page, DASHBOARD_URL)
        await pause(2)

        # Final beauty shot — hold on the hero
        await page.evaluate("window.scrollTo({ top: 0, behavior: 'smooth' })")
        await pause(5)

        print("\n" + "=" * 60)
        print("  🎉  DEMO COMPLETE — Stop recording.")
        print("=" * 60)

        await pause(2)
        if USE_REAL_TESTNET:
            await ctx.close()
        else:
            await browser.close()


# ════════════════════════════════════════════════════════════════════
#  VOICEOVER SCRIPT (print full script for reference)
# ════════════════════════════════════════════════════════════════════

VOICEOVER_SCRIPT = """
╔══════════════════════════════════════════════════════════════╗
║              SUIVAULT — VOICEOVER SCRIPT                     ║
║              Sui Overflow 2026 · 5 Minutes                   ║
╚══════════════════════════════════════════════════════════════╝

ACT 1 — THE HOOK (0:00–0:25)
─────────────────────────────
"AI agents are trading billions in crypto today — but they
hold unrestricted private keys. One rogue trade, one
compromised model, and an entire treasury gets drained.
SuiVault changes that."

  [ON SCREEN: Landing page hero with particle animation.
   Slow scroll reveals the tagline: 'Safe Spending for AI
   Agents'.]


ACT 2 — AUTHENTICATE & CONSOLE (0:25–1:10)
───────────────────────────────────────────
"Users sign in with zkLogin or securely connect their 
on-chain wallet. The dashboard immediately shows all 
active, on-chain agent vaults — each one a scoped spending
account for a specific AI agent."

  [ON SCREEN: Scroll to console section. Your active vaults
   appear with real balance statistics and statuses.]


ACT 3 — VAULT CREATION (1:10–2:10)
───────────────────────────────────
"Let's deploy a new on-chain vault for our AI trading agent.
We define the vault name, agent wallet address, and the SUI
initial funding amount."

  [ON SCREEN: Navigate to create page, type name and amount.]

"We then specify our guardrail preset. By selecting the 
DeepBook template, the Move smart contract locks the agent 
to target trading pairs and price envelopes."

  [ON SCREEN: Select preset, confirm settings, click Sign
   & Create Vault. Sign on wallet extension.]


ACT 4 — AGENT EXECUTION (2:10–3:20)
────────────────────────────────────
"Now the agent's perspective. The Agent Console is where AI
agents submit spend intents. We select the Arbitrage
strategy and pick a delegated key."

  [ON SCREEN: Agent console. Cycle through strategy tabs.
   Strategy descriptions and default amounts change.]

"The agent wants to execute a transaction. Before ANY 
transaction is signed, our AI Risk Guardian runs a pre-flight 
check — it evaluates policy rules and uploads its full
reasoning to Walrus decentralized storage."

  [ON SCREEN: Type recipient address and amount. Click
   'Submit Spend Transaction'. Sign transaction on wallet.]


ACT 5 — TRUST & VERIFY (3:20–4:05)
───────────────────────────────────
"Back in the vault — every action is recorded in the
on-chain audit log. Approved spends, blocked attempts,
key issuances — all with timestamps."

  [ON SCREEN: Vault detail → scroll to Activity Feed.
   Audit entries visible with status icons.]

"Expand any entry and you see the AI agent's actual
reasoning — pulled from Walrus decentralized blob
storage. This is an immutable, verifiable audit trail
that no one can tamper with."

  [ON SCREEN: Click 'Show Agent Reasoning' on
   entries. Reasoning text expands with blob storage IDs.]


ACT 6 — EMERGENCY RESPONSE (4:05–4:45)
───────────────────────────────────────
"What if an agent goes rogue? The owner has an emergency
kill switch. One click freezes ALL spending at the smart
contract level — no off-chain coordination, no delay."

  [ON SCREEN: Scroll to actions. Click 'Freeze Vault Now'.
   Confirm and approve transaction in wallet. The status
   flips to frozen red.]


ACT 7 — CLOSING (4:45–5:00)
────────────────────────────
"SuiVault. The first on-chain wallet protocol for
autonomous AI agents. Scoped vaults. Move-enforced
policies. DeepBook integration. Walrus audit trails.
Emergency kill switches. Built for Sui Overflow 2026."

  [ON SCREEN: Return to landing page. Hold on the hero
   with the SuiVault branding and particle animation.]

═══════════════════════════════════════════════════════════
"""


if __name__ == "__main__":
    # Print the voiceover script first so you can reference it
    print(VOICEOVER_SCRIPT)

    try:
        asyncio.run(run_demo())
    except KeyboardInterrupt:
        print("\nDemo interrupted.")
    except Exception as exc:
        print(f"\nDemo failed: {exc}")
        sys.exit(1)
