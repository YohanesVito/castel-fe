// Browser-only bridge to a Stellar wallet (Freighter, or Albedo as a web fallback) via
// Stellar Wallets Kit. Used by the crypto on-ramp: the user signs a real Circle-USDC payment
// from their own wallet to their Castel address. Everything here must run client-side only —
// the Kit registers web components, so imports are deferred to call time.
import { Asset, BASE_FEE, Horizon, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;
export const horizon = new Horizon.Server(HORIZON_URL);

// Bid well above the network minimum so the payment clears despite fee surges.
const FEE = String(Number(BASE_FEE) * 100);

// Stellar amounts allow at most 7 decimals and reject scientific notation; normalise before use.
const stroopAmount = (amount: string) => Number(amount).toFixed(7);

type Kit = typeof import("@creit.tech/stellar-wallets-kit").StellarWalletsKit;

let inited = false;
async function kit(): Promise<Kit> {
  const { StellarWalletsKit, Networks: KitNetworks } = await import("@creit.tech/stellar-wallets-kit");
  if (!inited) {
    const { FreighterModule, FREIGHTER_ID } = await import(
      "@creit.tech/stellar-wallets-kit/modules/freighter"
    );
    const { AlbedoModule } = await import("@creit.tech/stellar-wallets-kit/modules/albedo");
    StellarWalletsKit.init({
      network: KitNetworks.TESTNET,
      selectedWalletId: FREIGHTER_ID,
      modules: [new FreighterModule(), new AlbedoModule()],
    });
    inited = true;
  }
  return StellarWalletsKit;
}

/** Open the wallet picker and return the connected public key. */
export async function connectWallet(): Promise<string> {
  const k = await kit();
  const { address } = await k.authModal();
  return address;
}

export async function disconnectWallet(): Promise<void> {
  const k = await kit();
  await k.disconnect();
}

/** The passphrase the connected wallet is currently pointed at (to catch mainnet mistakes). */
export async function walletNetworkPassphrase(): Promise<string> {
  const k = await kit();
  const { networkPassphrase } = await k.getNetwork();
  return networkPassphrase;
}

export const onTestnet = (passphrase: string) => passphrase === NETWORK_PASSPHRASE;

async function signAndSubmit(from: string, build: (b: TransactionBuilder) => void): Promise<string> {
  const k = await kit();
  const source = await horizon.loadAccount(from);
  const builder = new TransactionBuilder(source, { fee: FEE, networkPassphrase: NETWORK_PASSPHRASE });
  build(builder);
  const tx = builder.setTimeout(180).build();
  const { signedTxXdr } = await k.signTransaction(tx.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: from,
  });
  const signed = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
  const res = await horizon.submitTransaction(signed);
  return res.hash;
}

/**
 * How much of this USDC the address holds. `null` means the account is unfunded or has no
 * trustline yet — i.e. it can't receive USDC until one is added.
 */
export async function usdcBalance(address: string, issuer: string): Promise<number | null> {
  try {
    const acc = await horizon.loadAccount(address);
    const line = acc.balances.find(
      (b) => "asset_code" in b && b.asset_code === "USDC" && b.asset_issuer === issuer,
    );
    return line && "balance" in line ? Number(line.balance) : null;
  } catch {
    return null; // account not funded yet
  }
}

/** Opt the connected wallet into Circle USDC so the faucet / a sender can pay it. */
export function addTrustline(from: string, issuer: string): Promise<string> {
  return signAndSubmit(from, (b) =>
    b.addOperation(Operation.changeTrust({ asset: new Asset("USDC", issuer) })),
  );
}

/** Send Circle USDC from the connected wallet to the Castel address. */
export function sendUsdc(params: {
  from: string;
  to: string;
  issuer: string;
  amount: string;
}): Promise<string> {
  return signAndSubmit(params.from, (b) =>
    b.addOperation(
      Operation.payment({
        destination: params.to,
        asset: new Asset("USDC", params.issuer),
        amount: stroopAmount(params.amount),
      }),
    ),
  );
}

/** Native XLM balance of the connected wallet (null if the account isn't funded yet). */
export async function nativeBalance(address: string): Promise<number | null> {
  try {
    const acc = await horizon.loadAccount(address);
    const line = acc.balances.find((b) => b.asset_type === "native");
    return line ? Number(line.balance) : 0;
  } catch {
    return null;
  }
}

/**
 * Send native XLM from the connected wallet to the Castel treasury, stamped with the MEMO_ID
 * from /deposit/xlm/prepare so the backend can bind the payment to this user.
 */
export function sendXlm(params: {
  from: string;
  to: string;
  amount: string;
  memo: string;
}): Promise<string> {
  return signAndSubmit(params.from, (b) => {
    b.addOperation(
      Operation.payment({
        destination: params.to,
        asset: Asset.native(),
        amount: stroopAmount(params.amount),
      }),
    ).addMemo(Memo.id(params.memo));
  });
}
