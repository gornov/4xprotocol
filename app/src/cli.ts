/// Command-line interface for basic admin functions

import { BN } from "@project-serum/anchor";
import { PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { PerpetualsClient, PositionSide } from "./client";
import { Command } from "commander";
import { readFileSync } from 'fs';
import path from 'path';
import YAML from 'yaml';

let client: PerpetualsClient;

function initClient(clusterUrl: string, adminKeyPath: string) {
  process.env["ANCHOR_WALLET"] = adminKeyPath;
  client = new PerpetualsClient(clusterUrl, adminKeyPath);
  client.log("Client Initialized");
}

async function updateOracle(address: PublicKey[]) {
  const tx = new Transaction();
  const buf = Buffer.alloc(256);
  tx.add(
    new TransactionInstruction({
      data: buf,
      programId: new PublicKey("shmem4EWT2sPdVGvTZCzXXRAURL9G5vpPxNwSeKhHUL"),
      keys: [{
        pubkey: new PublicKey("J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix"),
        isSigner: false,
        isWritable: true,
      }],
    })
  )
  let blockhash = (await client.provider.connection.getLatestBlockhash('finalized')).blockhash;
  tx.recentBlockhash = blockhash;
  tx.sign(client.admin);
  const signature = await sendAndConfirmTransaction(
    client.provider.connection,
    tx,
    [client.admin],
  );
  console.log('SIGNATURE', signature);
}

async function init(adminSigners: PublicKey[], minSignatures: number) {
  // to be loaded from config file
  let perpetualsConfig = {
    minSignatures: minSignatures,
    allowSwap: true,
    allowAddLiquidity: true,
    allowRemoveLiquidity: true,
    allowOpenPosition: true,
    allowClosePosition: true,
    allowPnlWithdrawal: true,
    allowCollateralWithdrawal: true,
    allowSizeChange: true,
  };
  client.init(adminSigners, perpetualsConfig);
}

async function setAuthority(adminSigners: PublicKey[], minSignatures: number) {
  client.setAdminSigners(adminSigners, minSignatures);
}

async function getMultisig() {
  client.prettyPrint(await client.getMultisig());
}

async function getPerpetuals() {
  client.prettyPrint(await client.getPerpetuals());
}

async function addPool(poolName: string) {
  client.addPool(poolName);
}

async function getPool(poolName: string) {
  client.prettyPrint(await client.getPool(poolName));
}

async function getPools() {
  client.prettyPrint(await client.getPools());
}

async function removePool(poolName: string) {
  client.removePool(poolName);
}

async function addCustody(
  poolName: string,
  tokenMint: PublicKey,
  tokenOracle: PublicKey,
  isStable: boolean
) {
  // to be loaded from config file
  let oracleConfig = {
    maxPriceError: new BN(10000),
    maxPriceAgeSec: 60,
    oracleType: { pyth: {} },
    oracleAccount: tokenOracle,
  };
  let pricingConfig = {
    useEma: true,
    useUnrealizedPnlInAum: true,
    tradeSpreadLong: new BN(100),
    tradeSpreadShort: new BN(100),
    swapSpread: new BN(200),
    minInitialLeverage: new BN(10000),
    maxInitialLeverage: new BN(1000000),
    maxLeverage: new BN(1000000),
    maxPayoffMult: new BN(10000),
    maxUtilization: new BN(10000),
    maxPositionLockedUsd: new BN(100000000000), // $100_000
    maxTotalLockedUsd: new BN(1000000000000), // $1_000_000
  };
  let permissions = {
    allowSwap: true,
    allowAddLiquidity: true,
    allowRemoveLiquidity: true,
    allowOpenPosition: true,
    allowClosePosition: true,
    allowPnlWithdrawal: true,
    allowCollateralWithdrawal: true,
    allowSizeChange: true,
  };
  let fees = {
    mode: { linear: {} },
    ratioMult: new BN(20000),
    utilizationMult: new BN(20000),
    swapIn: new BN(100),
    swapOut: new BN(100),
    stableSwapIn: new BN(100),
    stableSwapOut: new BN(100),
    addLiquidity: new BN(100),
    removeLiquidity: new BN(100),
    openPosition: new BN(100),
    closePosition: new BN(100),
    liquidation: new BN(100),
    protocolShare: new BN(10),
  };
  let borrowRate = {
    baseRate: new BN(0),
    slope1: new BN(80000),
    slope2: new BN(120000),
    optimalUtilization: new BN(800000000),
  };

  let pool = undefined;
  for (let index = 0; index < 3; index++) {
    try {
      pool = await client.getPool(poolName);
      break;
    } catch {
      // Handle retry
      console.warn("Failed to get pool. Retrying in 1 second");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  if (pool == undefined) {
    pool = await client.getPool(poolName); // Unhandled error
  }

  pool.ratios.push({
    target: new BN(5000),
    min: new BN(10),
    max: new BN(10000),
  });
  let ratios = client.adjustTokenRatios(pool.ratios);

  await client.addCustody(
    poolName,
    tokenMint,
    isStable,
    oracleConfig,
    pricingConfig,
    permissions,
    fees,
    borrowRate,
    ratios
  );
}

async function setCustodyConfig(
  poolName: string,
  tokenMint: PublicKey,
  tokenOracle: PublicKey,
  isStable: boolean
) {
  // to be loaded from config file
  let oracleConfig = {
    maxPriceError: new BN(10000),
    maxPriceAgeSec: 60,
    oracleType: { pyth: {} },
    oracleAccount: tokenOracle,
  };
  let pricingConfig = {
    useEma: true,
    useUnrealizedPnlInAum: true,
    tradeSpreadLong: new BN(100),
    tradeSpreadShort: new BN(100),
    swapSpread: new BN(200),
    minInitialLeverage: new BN(10000),
    maxInitialLeverage: new BN(1000000),
    maxLeverage: new BN(1000000),
    maxPayoffMult: new BN(10000),
    maxUtilization: new BN(10000),
    maxPositionLockedUsd: new BN(100000000000), // $100_000
    maxTotalLockedUsd: new BN(1000000000000), // $1_000_000
  };
  let permissions = {
    allowSwap: true,
    allowAddLiquidity: true,
    allowRemoveLiquidity: true,
    allowOpenPosition: true,
    allowClosePosition: true,
    allowPnlWithdrawal: true,
    allowCollateralWithdrawal: true,
    allowSizeChange: true,
  };
  let fees = {
    mode: { linear: {} },
    ratioMult: new BN(20000),
    utilizationMult: new BN(20000),
    swapIn: new BN(100),
    swapOut: new BN(100),
    stableSwapIn: new BN(100),
    stableSwapOut: new BN(100),
    addLiquidity: new BN(100),
    removeLiquidity: new BN(100),
    openPosition: new BN(100),
    closePosition: new BN(100),
    liquidation: new BN(100),
    protocolShare: new BN(10),
  };
  let borrowRate = {
    baseRate: new BN(0),
    slope1: new BN(80000),
    slope2: new BN(120000),
    optimalUtilization: new BN(800000000),
  };

  let pool = undefined;
  for (let index = 0; index < 3; index++) {
    try {
      pool = await client.getPool(poolName);
      break;
    } catch {
      // Handle retry
      console.warn("Failed to get pool. Retrying in 1 second");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  if (pool == undefined) {
    pool = await client.getPool(poolName); // Unhandled error
  }

  let ratios = client.adjustTokenRatios(pool.ratios);

  await client.setCustodyConfig(
    poolName,
    tokenMint,
    isStable,
    oracleConfig,
    pricingConfig,
    permissions,
    fees,
    borrowRate,
    ratios
  );
}

async function getCustody(poolName: string, tokenMint: PublicKey) {
  client.prettyPrint(await client.getCustody(poolName, tokenMint));
}

async function getCustodies(poolName: string) {
  client.prettyPrint(await client.getCustodies(poolName));
}

async function removeCustody(poolName: string, tokenMint: PublicKey) {
  let pool = await client.getPool(poolName);
  (pool.ratios as any).pop();
  let ratios = client.adjustTokenRatios(pool.ratios);

  await client.removeCustody(poolName, tokenMint, ratios);
}

async function upgradeCustody(poolName: string, tokenMint: PublicKey) {
  await client.upgradeCustody(poolName, tokenMint);
}

async function upgradePosition(poolName: string, tokenMint: PublicKey, owner: PublicKey, side: PositionSide) {
  const position = client.getPositionKey(owner, poolName, tokenMint, side);
  await client.upgradePosition(poolName, position);
}

async function upgradePositionByKey(poolName: string, position: PublicKey) {
  await client.upgradePosition(poolName, position);
}

async function addLiquidity(
  poolName: string,
  tokenMint: PublicKey,
  amountIn: BN,
) {
  const minLpAmountOut = new BN(1);

  let fundingAccount = await spl.getOrCreateAssociatedTokenAccount(
    client.provider.connection,
    client.admin,
    tokenMint,
    client.admin.publicKey,
  );
  console.log("fundingAccount", fundingAccount);

  const lpTokenMint = client.getPoolLpTokenKey(poolName);
  let lpTokenAccount = await spl.getOrCreateAssociatedTokenAccount(
    client.provider.connection,
    client.admin,
    lpTokenMint,
    client.admin.publicKey,
  );
  console.log("lpTokenAccount", lpTokenAccount);

  await client.addLiquidity(
    amountIn,
    minLpAmountOut,
    fundingAccount.address,
    lpTokenAccount.address,
    poolName,
    tokenMint,
  )
}

async function liquidate(
  poolName: string,
  tokenMint: PublicKey,
  owner: PublicKey,
  side: PositionSide,
) {
  let position = await client.getUserPosition(owner, poolName, tokenMint, side);

  let userTokenAccount = (
    await spl.getOrCreateAssociatedTokenAccount(
      client.provider.connection,
      client.admin,
      tokenMint,
      position.owner
    )
  ).address;

  let rewardReceivingAccount = (
    await spl.getOrCreateAssociatedTokenAccount(
      client.provider.connection,
      client.admin,
      tokenMint,
      client.admin.publicKey
    )
  ).address;

  await client.liquidate(
    position.owner,
    poolName,
    tokenMint,
    side,
    userTokenAccount,
    rewardReceivingAccount,
  )
}

async function triggerPosition(
  poolName: string,
  tokenMint: PublicKey,
  owner: PublicKey,
  side: PositionSide,
  price: BN,
) {
  let position = await client.getUserPosition(owner, poolName, tokenMint, side);

  let userTokenAccount = (
    await spl.getOrCreateAssociatedTokenAccount(
      client.provider.connection,
      client.admin,
      tokenMint,
      position.owner
    )
  ).address;

  let rewardReceivingAccount = (
    await spl.getOrCreateAssociatedTokenAccount(
      client.provider.connection,
      client.admin,
      tokenMint,
      client.admin.publicKey
    )
  ).address;

  await client.triggerPosition(
    position.owner,
    poolName,
    tokenMint,
    side,
    userTokenAccount,
    rewardReceivingAccount,
    price,
  )
}

async function updatePositionLimits(
  poolName: string,
  tokenMint: PublicKey,
  owner: PublicKey,
  side: PositionSide,
  stopLoss: BN | null,
  takeProfit: BN | null,
) {
  let position = await client.getUserPosition(owner, poolName, tokenMint, side);

  await client.updatePositionLimits(
    position.owner,
    poolName,
    tokenMint,
    side,
    stopLoss,
    takeProfit,
  )
}

async function getUserPosition(
  wallet: PublicKey,
  poolName: string,
  tokenMint: PublicKey,
  side: PositionSide
) {
  client.prettyPrint(
    await client.getUserPosition(wallet, poolName, tokenMint, side)
  );
}

async function getUserPositions(wallet: PublicKey) {
  client.prettyPrint(await client.getUserPositions(wallet));
}

async function getPoolTokenPositions(poolName: string, tokenMint: PublicKey) {
  client.prettyPrint(await client.getPoolTokenPositions(poolName, tokenMint));
}

async function getAllPositions() {
  client.prettyPrint(await client.getAllPositions());
}

async function getAddLiquidityAmountAndFee(
  poolName: string,
  tokenMint: PublicKey,
  amount: BN
) {
  client.prettyPrint(
    await client.getAddLiquidityAmountAndFee(poolName, tokenMint, amount)
  );
}

async function getRemoveLiquidityAmountAndFee(
  poolName: string,
  tokenMint: PublicKey,
  lpAmount: BN
) {
  client.prettyPrint(
    await client.getRemoveLiquidityAmountAndFee(poolName, tokenMint, lpAmount)
  );
}

async function getEntryPriceAndFee(
  poolName: string,
  tokenMint: PublicKey,
  collateral: BN,
  size: BN,
  side: PositionSide
) {
  client.prettyPrint(
    await client.getEntryPriceAndFee(
      poolName,
      tokenMint,
      collateral,
      size,
      side
    )
  );
}

async function getExitPriceAndFee(
  wallet: PublicKey,
  poolName: string,
  tokenMint: PublicKey,
  side: PositionSide
) {
  client.prettyPrint(
    await client.getExitPriceAndFee(wallet, poolName, tokenMint, side)
  );
}

async function getOraclePrice(
  poolName: string,
  tokenMint: PublicKey,
  useEma: boolean
) {
  client.prettyPrint(await client.getOraclePrice(poolName, tokenMint, useEma));
}

async function getLiquidationPrice(
  wallet: PublicKey,
  poolName: string,
  tokenMint: PublicKey,
  side: PositionSide,
  addCollateral: BN,
  removeCollateral: BN
) {
  client.prettyPrint(
    await client.getLiquidationPrice(
      wallet,
      poolName,
      tokenMint,
      side,
      addCollateral,
      removeCollateral
    )
  );
}

async function getLiquidationState(
  wallet: PublicKey,
  poolName: string,
  tokenMint: PublicKey,
  side: PositionSide
) {
  client.prettyPrint(
    await client.getLiquidationState(wallet, poolName, tokenMint, side)
  );
}

async function getPnl(
  wallet: PublicKey,
  poolName: string,
  tokenMint: PublicKey,
  side: PositionSide
) {
  client.prettyPrint(await client.getPnl(wallet, poolName, tokenMint, side));
}

async function getSwapAmountAndFees(
  poolName: string,
  tokenMintIn: PublicKey,
  tokenMintOut: PublicKey,
  amountIn: BN
) {
  client.prettyPrint(
    await client.getSwapAmountAndFees(
      poolName,
      tokenMintIn,
      tokenMintOut,
      amountIn
    )
  );
}

async function getAum(poolName: string) {
  client.prettyPrint(await client.getAum(poolName));
}

(async function main() {
  const program = new Command();
  program
    .name("cli.ts")
    .description("CLI to Solana Perpetuals Exchange Program")
    .version("0.1.0")
    .option("-u, --url <string>", "URL for Solana's JSON RPC")
    .option("-k, --keypair <path>", "Filepath to the admin keypair")
    .hook("preSubcommand", (thisCommand, subCommand) => {
      let defaultKeypair;
      let defaultUrl;

      try {
        const solanaConfigFile = readFileSync(
          path.join(process.env.HOME, ".config/solana/cli/config.yml"),
          "utf8",
        );
        const solanaConfig = YAML.parse(solanaConfigFile);
        defaultKeypair = solanaConfig.keypair_path;
        defaultUrl = solanaConfig.json_rpc_url;
      } catch {
        defaultKeypair = undefined;
        defaultUrl = undefined;
      }

      const keypair = program.opts().keypair || defaultKeypair;
      const url = program.opts().url || defaultUrl;

      if (!keypair) {
        throw Error("required option '-k, --keypair <path>' not specified");
      }
      if (!url) {
        throw Error("required option '-u, --url <string>' not specified");
      }
      initClient(url, keypair);
      client.log(`Processing command '${thisCommand.args[0]}'`);
    })
    .hook("postAction", () => {
      client.log("Done");
    });

  program
    .command("updateOracle")
    .description("updateOracle")
    .argument("<pubkey...>", "Admin public keys")
    .action(async (args, options) => {
      await updateOracle(
        args.map((x) => new PublicKey(x)),
      );
    });

  program
    .command("init")
    .description("Initialize the on-chain program")
    .requiredOption("-m, --min-signatures <int>", "Minimum signatures")
    .argument("<pubkey...>", "Admin public keys")
    .action(async (args, options) => {
      await init(
        args.map((x) => new PublicKey(x)),
        options.minSignatures
      );
    });

  program
    .command("set-authority")
    .description("Set protocol admins")
    .requiredOption("-m, --min-signatures <int>", "Minimum signatures")
    .argument("<pubkey...>", "Admin public keys")
    .action(async (args, options) => {
      await setAuthority(
        args.map((x) => new PublicKey(x)),
        options.minSignatures
      );
    });

  program
    .command("get-multisig")
    .description("Print multisig state")
    .action(async () => {
      await getMultisig();
    });

  program
    .command("get-perpetuals")
    .description("Print perpetuals global state")
    .action(async () => {
      await getPerpetuals();
    });

  program
    .command("add-pool")
    .description("Create a new pool")
    .argument("<string>", "Pool name")
    .action(async (poolName) => {
      await addPool(poolName);
    });

  program
    .command("get-pool")
    .description("Print metadata for the pool")
    .argument("<string>", "Pool name")
    .action(async (poolName) => {
      await getPool(poolName);
    });

  program
    .command("get-pools")
    .description("Print metadata for all pools")
    .action(async () => {
      await getPools();
    });

  program
    .command("remove-pool")
    .description("Remove the pool")
    .argument("<string>", "Pool name")
    .action(async (poolName) => {
      await removePool(poolName);
    });

  program
    .command("add-custody")
    .description("Add a new token custody to the pool")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .argument("<pubkey>", "Token oracle account")
    .option("-s, --stablecoin", "Custody is for a stablecoin")
    .action(async (poolName, tokenMint, tokenOracle, options) => {
      await addCustody(
        poolName,
        new PublicKey(tokenMint),
        new PublicKey(tokenOracle),
        options.stablecoin
      );
    });

  program
    .command("set-custody-config")
    .description("Update token custody config")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .argument("<pubkey>", "Token oracle account")
    .option("-s, --stablecoin", "Custody is for a stablecoin")
    .action(async (poolName, tokenMint, tokenOracle, options) => {
      await setCustodyConfig(
        poolName,
        new PublicKey(tokenMint),
        new PublicKey(tokenOracle),
        options.stablecoin
      );
    });

  program
    .command("get-custody")
    .description("Print metadata for the token custody")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .action(async (poolName, tokenMint) => {
      await getCustody(poolName, new PublicKey(tokenMint));
    });

  program
    .command("get-custodies")
    .description("Print metadata for all custodies")
    .argument("<string>", "Pool name")
    .action(async (poolName) => {
      await getCustodies(poolName);
    });

  program
    .command("remove-custody")
    .description("Remove the token custody from the pool")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .action(async (poolName, tokenMint) => {
      await removeCustody(poolName, new PublicKey(tokenMint));
    });

  program
    .command("upgrade-custody")
    .description("Upgrade deprecated custody to the new version")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .action(async (poolName, tokenMint, options) => {
      await upgradeCustody(poolName, new PublicKey(tokenMint));
    });

  program
    .command("upgrade-position")
    .description("Upgrade deprecated position to the new version")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .argument("<pubkey>", "Owner")
    .argument("<string>", "Side")
    .action(async (poolName, tokenMint, owner, side, options) => {
      if (side !== "long" && side !== "short") {
        throw Error(`Unexpected side: ${side}. Expected: long | short`)
      }
      await upgradePosition(poolName, new PublicKey(tokenMint), new PublicKey(owner), side);
    });

  program
    .command("upgrade-position-by-key")
    .description("Upgrade deprecated position to the new version")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Position")
    .action(async (poolName, position, options) => {
      await upgradePositionByKey(poolName, new PublicKey(position));
    });

  program
    .command("liquidate")
    .description("Liquidate position")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .argument("<pubkey>", "Owner")
    .argument("<string>", "Side")
    .action(async (poolName, tokenMint, owner, side, rewardReceivingAccount, options) => {
      await liquidate(
        poolName,
        new PublicKey(tokenMint),
        new PublicKey(owner),
        side,
      );
    });

  program
    .command("trigger-position")
    .description("Trigger position")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .argument("<pubkey>", "Owner")
    .argument("<string>", "Side")
    .argument("<pubkey>", "rewardReceivingAccount")
    .requiredOption("-p, --price <bigint>", "Price")
    .action(async (poolName, tokenMint, owner, side, rewardReceivingAccount, options) => {
      await triggerPosition(
        poolName,
        new PublicKey(tokenMint),
        new PublicKey(owner),
        side,
        new BN(options.price),
      );
    });

  program
    .command("update-position-limits")
    .description("Update position limits")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .argument("<pubkey>", "Owner")
    .argument("<string>", "Side")
    .argument("<bigint>", "Stop loss or null")
    .argument("<bigint>", "Take profit or null")
    .action(async (poolName, tokenMint, owner, side, rawStopLoss, rawTakeProfit, options) => {
      const stopLoss = rawStopLoss === "0" || rawStopLoss === "null" ? null : new BN(rawStopLoss);
      const takeProfit = rawTakeProfit === "0" || rawTakeProfit === "null" ? null : new BN(rawTakeProfit);
      await updatePositionLimits(
        poolName,
        new PublicKey(tokenMint),
        new PublicKey(owner),
        side,
        stopLoss,
        takeProfit,
      );
    });

  program
    .command("add-liquidity")
    .description("Add liquidity to custody")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .requiredOption("-a, --amount <bigint>", "Token amount")
    .action(async (poolName, tokenMint, options) => {
      await addLiquidity(poolName, new PublicKey(tokenMint), new BN(options.amount));
    });

  program
    .command("get-user-position")
    .description("Print user position metadata")
    .argument("<pubkey>", "User wallet")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .argument("<string>", "Position side (long / short)")
    .action(async (wallet, poolName, tokenMint, side) => {
      await getUserPosition(
        new PublicKey(wallet),
        poolName,
        new PublicKey(tokenMint),
        side
      );
    });

  program
    .command("get-user-positions")
    .description("Print all user positions")
    .argument("<pubkey>", "User wallet")
    .action(async (wallet) => {
      await getUserPositions(new PublicKey(wallet));
    });

  program
    .command("get-pool-token-positions")
    .description("Print positions in the token")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .action(async (poolName, tokenMint) => {
      await getPoolTokenPositions(poolName, new PublicKey(tokenMint));
    });

  program
    .command("get-all-positions")
    .description("Print all open positions")
    .action(async () => {
      await getAllPositions();
    });

  program
    .command("get-add-liquidity-amount-and-fee")
    .description("Compute LP amount returned and fee for add liquidity")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .requiredOption("-a, --amount <bigint>", "Token amount")
    .action(async (poolName, tokenMint, options) => {
      await getAddLiquidityAmountAndFee(
        poolName,
        new PublicKey(tokenMint),
        new BN(options.amount)
      );
    });

  program
    .command("get-remove-liquidity-amount-and-fee")
    .description("Compute token amount returned and fee for remove liquidity")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .requiredOption("-a, --amount <bigint>", "LP token amount")
    .action(async (poolName, tokenMint, options) => {
      await getRemoveLiquidityAmountAndFee(
        poolName,
        new PublicKey(tokenMint),
        new BN(options.amount)
      );
    });

  program
    .command("get-entry-price-and-fee")
    .description("Compute price and fee to open a position")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .argument("<string>", "Position side (long / short)")
    .requiredOption("-c, --collateral <bigint>", "Collateral")
    .requiredOption("-s, --size <bigint>", "Size")
    .action(async (poolName, tokenMint, side, options) => {
      await getEntryPriceAndFee(
        poolName,
        new PublicKey(tokenMint),
        new BN(options.collateral),
        new BN(options.size),
        side
      );
    });

  program
    .command("get-exit-price-and-fee")
    .description("Compute price and fee to close the position")
    .argument("<pubkey>", "User wallet")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .argument("<string>", "Position side (long / short)")
    .action(async (wallet, poolName, tokenMint, side) => {
      await getExitPriceAndFee(
        new PublicKey(wallet),
        poolName,
        new PublicKey(tokenMint),
        side
      );
    });

  program
    .command("get-oracle-price")
    .description("Read oracle price for the token")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .option("-e, --ema", "Return EMA price")
    .action(async (poolName, tokenMint, options) => {
      await getOraclePrice(poolName, new PublicKey(tokenMint), options.ema);
    });

  program
    .command("get-liquidation-price")
    .description("Compute liquidation price for the position")
    .argument("<pubkey>", "User wallet")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .argument("<string>", "Position side (long / short)")
    .option("-a, --add-collateral <bigint>", "Collateral to add")
    .option("-r, --remove-collateral <bigint>", "Collateral to remove")
    .action(async (wallet, poolName, tokenMint, side, options) => {
      await getLiquidationPrice(
        new PublicKey(wallet),
        poolName,
        new PublicKey(tokenMint),
        side,
        new BN(options.addCollateral),
        new BN(options.removeCollateral)
      );
    });

  program
    .command("get-liquidation-state")
    .description("Get liquidation state of the position")
    .argument("<pubkey>", "User wallet")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .argument("<string>", "Position side (long / short)")
    .action(async (wallet, poolName, tokenMint, side) => {
      await getLiquidationState(
        new PublicKey(wallet),
        poolName,
        new PublicKey(tokenMint),
        side
      );
    });

  program
    .command("get-pnl")
    .description("Compute PnL of the position")
    .argument("<pubkey>", "User wallet")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .argument("<string>", "Position side (long / short)")
    .action(async (wallet, poolName, tokenMint, side) => {
      await getPnl(
        new PublicKey(wallet),
        poolName,
        new PublicKey(tokenMint),
        side
      );
    });

  program
    .command("get-swap-amount-and-fees")
    .description("Compute amount out and fees for the swap")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint in")
    .argument("<pubkey>", "Token mint out")
    .requiredOption("-i, --amount-in <bigint>", "Token amount to be swapped")
    .action(async (poolName, tokenMintIn, tokenMintOut, options) => {
      await getSwapAmountAndFees(
        poolName,
        new PublicKey(tokenMintIn),
        new PublicKey(tokenMintOut),
        new BN(options.amountIn)
      );
    });

  program
    .command("get-aum")
    .description("Get assets under management")
    .argument("<string>", "Pool name")
    .action(async (poolName) => {
      await getAum(poolName);
    });

  await program.parseAsync(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
})();
