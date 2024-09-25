import { Request, Response } from "express";

export type Routes = {
  path: string;
  get?: (req: Request, res: Response) => any;
  delete?: (req: Request, res: Response) => any;
  post?: (req: Request, res: Response) => any;
  patch?: (req: Request, res: Response) => any;
}[];
