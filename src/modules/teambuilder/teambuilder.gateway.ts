import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { TeambuilderService } from "./teambuilder.service";

const ALLOWED_ORIGINS = [
  "http://localhost:4200",
  "https://pokemondraftzone.com",
  "https://dqptrox2bn9qw.cloudfront.net",
];

@WebSocketGateway({
  namespace: "teambuilder",
  path: "/ws/",
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
})
export class TeambuilderGateway {
  constructor(private readonly teambuilderService: TeambuilderService) {}

  @SubscribeMessage("shouldHighlightMove")
  shouldHighlightMove(
    @MessageBody()
    data: Parameters<TeambuilderService["shouldHighlightMove"]>[0],
  ) {
    return this.teambuilderService.shouldHighlightMove(data);
  }

  @SubscribeMessage("shouldHighlightItem")
  shouldHighlightItem(
    @MessageBody()
    data: Parameters<TeambuilderService["shouldHighlightItem"]>[0],
  ) {
    return this.teambuilderService.shouldHighlightItem(data);
  }

  @SubscribeMessage("getModifiedMove")
  getModifiedMove(
    @MessageBody() data: Parameters<TeambuilderService["getModifiedMove"]>[0],
  ) {
    return this.teambuilderService.getModifiedMove(data);
  }

  @SubscribeMessage("getModifiedType")
  getModifiedType(
    @MessageBody() data: Parameters<TeambuilderService["getModifiedType"]>[0],
  ) {
    return this.teambuilderService.getModifiedType(data);
  }

  @SubscribeMessage("getProcessedLearnset")
  getProcessedLearnset(
    @MessageBody()
    data: Parameters<TeambuilderService["getProcessedLearnset"]>[0],
  ) {
    return this.teambuilderService.getProcessedLearnset(data);
  }
}
