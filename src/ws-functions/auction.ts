// import { Server, Socket } from "socket.io";
// import { logger } from "../app";

// const activeAuctions = new Map();
// const auctionItems: {
//   [key: string | number]: { name: string };
// } = {
//   maushold: { name: "Maushold" },
//   palafin: { name: "Palafin" },
//   annihilape: { name: "Annihilape" },
//   deoxysattack: { name: "Deoxys-Attack" },
// };

// function startAuctionForItem(leagueId: string, itemId: string | number) {
//   if (!auctionItems[itemId]) {
//     logger.error(`Attempted to start auction for invalid item: ${itemId}`);
//     return null;
//   }

//   if (!activeAuctions.has(leagueId)) {
//     activeAuctions.set(leagueId, new Map());
//   }
//   const leagueAuctions = activeAuctions.get(leagueId);

//   if (leagueAuctions.has(itemId)) {
//     return leagueAuctions.get(itemId);
//   }

//   const item = auctionItems[itemId];
//   const startTime = new Date();
//   const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
//   const STARTINGBID = 50;
//   const auctionState = {
//     itemId,
//     itemName: item.name,
//     currentBid: STARTINGBID,
//     lastBidder: null,
//     auctionEndTime: endTime.toISOString(),
//   };

//   leagueAuctions.set(itemId, auctionState);
//   logger.info(`Auction started for league ${leagueId}: Item ${item.name}`);
//   return auctionState;
// }

// export const functions = {
//   placeBid: (io: Server, socket: Socket, { leagueId, itemId, bidAmount }) => {
//     const leagueAuctions = activeAuctions.get(leagueId);
//     const auction = leagueAuctions ? leagueAuctions.get(itemId) : null;
//     const roomName = `auction-${leagueId}`;
//     if (!auction) {
//       return socket.emit("auctionError", {
//         leagueId,
//         itemId,
//         message: "Auction not found.",
//       });
//     }
//     if (new Date() >= new Date(auction.auctionEndTime)) {
//       return socket.emit("auctionError", {
//         leagueId,
//         itemId,
//         message: "This auction has ended.",
//       });
//     }
//     if (bidAmount <= auction.currentBid) {
//       return socket.emit("auctionError", {
//         leagueId,
//         itemId,
//         message: "Your bid must be higher than the current bid.",
//       });
//     }
//     auction.currentBid = bidAmount;
//     auction.lastBidder = socket.id;
//     const now = new Date();
//     let newEndTime = new Date(
//       new Date(auction.auctionEndTime).getTime() + 5 * 60 * 1000
//     );
//     const maxEndTime = new Date(now.getTime() + 60 * 60 * 1000);

//     if (newEndTime > maxEndTime) {
//       newEndTime = maxEndTime;
//     }
//     auction.auctionEndTime = newEndTime.toISOString();
//     io.to(roomName).emit("auctionUpdate", auction);
//   },

//   joinAuction: (io: Server, socket: Socket, leagueId: string) => {
//     const roomName = `auction-${leagueId}`;
//     socket.join(roomName);
//     console.log(`Socket ${socket.id} joined auction room: ${roomName}`);

//     if (!activeAuctions.has(leagueId)) {
//       console.log(`No auctions for league ${leagueId}. Starting defaults.`);
//       Object.keys(auctionItems).forEach((itemId) => {
//         startAuctionForItem(leagueId, itemId);
//       });
//     }

//     const leagueAuctions = activeAuctions.get(leagueId);
//     const auctionsObject = Object.fromEntries(leagueAuctions.entries());
//     socket.emit("allAuctions", auctionsObject);
//   },
// };
