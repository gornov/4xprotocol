import { Connection } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@project-serum/anchor";
import { ENDPOINT } from "src/pages/_app";

export async function getProvider(
  wallet: Wallet,
  // network: string = "devnet"
): Promise<AnchorProvider> {
  // let network_url;
  // if (network === "devnet") {
  //   network_url = "https://api.devnet.solana.com";
  // } else {
  //   network_url = "http://localhost:8899";
  // }

  const connection = new Connection(ENDPOINT, {
    commitment: "processed",
  });

  const provider = new AnchorProvider(connection, wallet, {
    commitment: "processed",
    skipPreflight: true,
  });
  return provider;
}
