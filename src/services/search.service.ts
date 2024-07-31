import { Generations, ID, Specie } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import {
  getAbilities,
  getImmune,
  getResists,
  getWeak,
} from "./data-services/pokedex.service";
import { RulesetId, Rulesets } from "../data/rulesets";

// Types for tokens and AST nodes
type Token = { type: string; value: string };
type ASTNode = {
  type: string;
  left?: ASTNode;
  right?: ASTNode;
  value?: any;
  operator?: string;
};

let gen = new Generations(Dex).get(9);

export async function searchPokemon(query: string, ruleset: RulesetId) {
  const tokens = tokenize(query);
  const ast = parse(tokens);
  gen = Rulesets[ruleset].gen;
  let searchResults = await Promise.all(
    Array.from(gen.species).map(async (pokemon) => {
      return [pokemon.id, await evaluate(ast, pokemon)];
    })
  );

  return searchResults.filter((result) => result[1]).map((result) => result[0]);
}

// Tokenizer function
function tokenize(input: string): Token[] {
  const regex =
    /\s*(=>|!=|>=|<=|>|<|=|includes|!includes|\(|\)|and|or|'[^']*'|[A-Za-z_][A-Za-z0-9_]*|"[^"]*"|\d+|\S)\s*/g;
  const tokens: Token[] = [];
  let match;
  while ((match = regex.exec(input)) !== null) {
    tokens.push({ type: match[0].trim(), value: match[0].trim() });
  }
  return tokens;
}

// Parser functions
function parse(tokens: Token[]): ASTNode {
  let current = 0;

  function walk(): ASTNode {
    let token = tokens[current];

    if (token.type === "(") {
      current++;
      let node = parseExpression();
      current++;
      return node;
    }

    if (token.type === "not") {
      current++;
      return {
        type: "NotExpression",
        value: walk(),
      };
    }

    if (["and", "or"].includes(token.type)) {
      throw new TypeError(`Unexpected token: ${token.type}`);
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token.type)) {
      current++;
      let operator = tokens[current];
      current++;
      let valueToken = tokens[current];
      current++;
      return {
        type: "BinaryExpression",
        left: { type: "Identifier", value: token.value },
        operator: operator.value,
        right: {
          type: /^[A-Za-z_][A-Za-z0-9_]*$/.test(valueToken.type)
            ? "Identifier"
            : "Literal",
          value: valueToken.value.replace(/^['"]|['"]$/g, ""),
        },
      };
    }

    throw new TypeError(`Unexpected token: ${token.type}`);
  }

  function parseExpression(): ASTNode {
    let node = walk();

    while (
      current < tokens.length &&
      ["and", "or"].includes(tokens[current].type)
    ) {
      let operator = tokens[current];
      current++;
      node = {
        type: "LogicalExpression",
        operator: operator.value,
        left: node,
        right: walk(),
      };
    }

    return node;
  }

  return parseExpression();
}

// Evaluator function
async function evaluate(
  node: ASTNode | undefined,
  mon: Specie
): Promise<boolean> {
  if (node) {
    switch (node.type) {
      case "LogicalExpression":
        if (node.operator === "and") {
          return (
            (await evaluate(node.left, mon)) &&
            (await evaluate(node.right!, mon))
          );
        }
        if (node.operator === "or") {
          return (
            (await evaluate(node.left, mon)) ||
            (await evaluate(node.right!, mon))
          );
        }
        break;
      case "BinaryExpression":
        let leftValue: any;
        let rightValue: any;
        switch (node.left!.value) {
          case "name":
            leftValue = mon.name;
            break;
          case "bst":
            leftValue =
              mon.baseStats.hp +
              mon.baseStats.atk +
              mon.baseStats.def +
              mon.baseStats.spa +
              mon.baseStats.spd +
              mon.baseStats.spe;
            break;
          case "hp":
            leftValue = mon.baseStats.hp;
            break;
          case "atk":
            leftValue = mon.baseStats.atk;
            break;
          case "def":
            leftValue = mon.baseStats.def;
            break;
          case "spa":
            leftValue = mon.baseStats.spa;
            break;
          case "spd":
            leftValue = mon.baseStats.spd;
            break;
          case "spe":
            leftValue = mon.baseStats.spe;
            break;
          case "weaks":
            leftValue = getWeak(mon);
            break;
          case "resists":
            leftValue = getResists(mon);
            break;
          case "immunities":
            leftValue = getImmune(mon);
            break;
          case "coverage":
            leftValue = Object.keys(
              (await gen.learnsets.learnable(mon.id)) || {}
            )
              .map((moveid) => gen.dex.moves.getByID(moveid as ID))
              .filter((move) => move.category != "Status")
              .reduce<string[]>(
                (coverage, move) =>
                  coverage.includes(move.type)
                    ? coverage
                    : [...coverage, move.type],
                []
              );
            break;
          case "learns":
            leftValue = (await gen.learnsets.canLearn(
              mon.id,
              node.right?.value || ""
            ))
              ? node.right?.value
              : "";
            break;
          case "abilities":
            leftValue = getAbilities(mon);
            break;
          case "tier":
            let tiers = [
              "ZU",
              "ZUBL",
              "PU",
              "PUBL",
              "NU",
              "NUBL",
              "RU",
              "RUBL",
              "UU",
              "UUBL",
              "OU",
              "UBER",
              "AG",
            ];
            leftValue =
              tiers.indexOf(mon.tier) > 0 ? tiers.indexOf(mon.tier) : mon.tier;
            rightValue =
              tiers.indexOf(node.right?.value) > 0
                ? tiers.indexOf(node.right?.value)
                : node.right?.value;
            break;
          case "nfe":
            leftValue = mon.nfe;
            break;
          case "dexNum":
            leftValue = mon.num;
            rightValue = +node.right?.value;
            break;
          case "tags":
            let tags = [
              "Paradox",
              "Sub-Legendary",
              "Mythical",
              "Restricted Legendary",
            ];
            leftValue = mon.tags
              .map((tag) => tags.indexOf(tag))
              .reduce((max, i) => (max = i > max ? i : max), -1);
            rightValue = tags.indexOf(node.right?.value);
            break;
          case "type":
          case "types":
            leftValue = mon.types;
            break;
          case "gen":
            leftValue = mon.gen;
            rightValue = +node.right?.value;
            break;
          case "weight":
            leftValue = mon.weightkg;
            break;
          case "egggroups":
            leftValue = mon.eggGroups;
            break;
          default:
            console.log(`Unknown value: ${node.left?.value}`);
        }

        if (rightValue === undefined) {
          switch (node.right!.value) {
            case "false":
              rightValue = false;
              break;
            case "true":
              rightValue = true;
              break;
            case "none":
            case "undefined":
              rightValue = undefined;
            default:
              rightValue = node.right!.value;
          }
        }
        if (Array.isArray(leftValue)) {
          switch (node.operator) {
            case "includes":
              return leftValue.includes(rightValue);
            case "!includes":
              return !leftValue.includes(rightValue);
            case "=":
              return leftValue == rightValue;
            case "!=":
              return leftValue != rightValue;
            default:
              console.log(
                `Parsing error: invalid array binary operator "${node.operator}"`
              );
          }
        } else {
          switch (node.operator) {
            case "=":
              return leftValue == rightValue;
            case "!=":
              return leftValue != rightValue;
            case ">":
              return leftValue > rightValue;
            case "<":
              return leftValue < rightValue;
            case ">=":
              return leftValue >= rightValue;
            case "<=":
              return leftValue <= rightValue;
            default:
              console.log(
                `Parsing error: invalid string binary operator "${node.operator}"`
              );
          }
        }
        break;
      case "Identifier":
        return !!mon[node.value as keyof Specie];
      case "Literal":
        return node.value;
    }
  }
  return false;
}
