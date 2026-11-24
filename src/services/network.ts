import NetInfo from '@react-native-community/netinfo';

let isOnline = true;

export function checkOnline(): boolean {
  return isOnline;
}

export function subscribeNetwork(cb: (online: boolean) => void): () => void {
  return NetInfo.addEventListener((state) => {
    const online = !!(state.isConnected && state.isInternetReachable !== false);
    isOnline = online;
    cb(online);
  });
}