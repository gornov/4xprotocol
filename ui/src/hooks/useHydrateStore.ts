import { fetchAllStats } from "@/hooks/storeHelpers/fetchPrices";
import { getAllUserData } from "@/hooks/storeHelpers/fetchUserData";
import { useGlobalStore } from "@/stores/store";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useEffect } from "react";
import { getCustodyData } from "./storeHelpers/fetchCustodies";
import { getPoolData } from "./storeHelpers/fetchPools";
import { getPositionData } from "./storeHelpers/fetchPositions";

export const useHydrateStore = () => {
  const setCustodyData = useGlobalStore((state) => state.setCustodyData);
  const setPoolData = useGlobalStore((state) => state.setPoolData);
  const setPositionData = useGlobalStore((state) => state.setPositionData);

  const custodyData = useGlobalStore((state) => state.custodyData);
  const poolData = useGlobalStore((state) => state.poolData);

  const setUserData = useGlobalStore((state) => state.setUserData);
  const setPriceStats = useGlobalStore((state) => state.setPriceStats);

  const { connection } = useConnection();
  const { publicKey } = useWallet();

  useEffect(() => {
    (async () => {
      const custodyData = await getCustodyData();
      const [poolData, positionInfos] = await Promise.all([
        getPoolData(custodyData),
        getPositionData(custodyData, publicKey || undefined),
      ]);

      console.log("poolData", poolData);

      setCustodyData(custodyData);
      setPoolData(poolData);
      setPositionData(positionInfos);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (publicKey) {
        // @ts-ignore
        const positionInfos = await getPositionData(custodyData, publicKey || undefined);
        // setPositionData(positionInfos);
      }
    })();
  }, [publicKey, custodyData])

  useEffect(() => {
    if (
      publicKey &&
      Object.values(poolData).length > 0
      // && Object.values(userData.lpBalances).length == 0
    ) {
      (async () => {
        const userData = await getAllUserData(connection, publicKey, poolData);
        setUserData(userData);
      })();
    }
  }, [publicKey, poolData]);

  useEffect(() => {
    const fetchAndSetStats = async () => {
      const priceStats = await fetchAllStats();
      setPriceStats(priceStats);
    };

    fetchAndSetStats();

    const interval = setInterval(fetchAndSetStats, 30000);

    return () => clearInterval(interval);
  }, []);
};
