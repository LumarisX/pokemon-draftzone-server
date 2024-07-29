import { Generations, Specie } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import {
  newgetImmune,
  newgetResists,
  newgetWeak,
} from "./data-services/pokedex.service";

// Types for tokens and AST nodes
type Token = { type: string; value: string };
type ASTNode = {
  type: string;
  left?: ASTNode;
  right?: ASTNode;
  value?: any;
  operator?: string;
};

export function searchPokemon(query: string, genNum: number) {
  const tokens = tokenize(query);
  const ast = parse(tokens);
  let gens = new Generations(Dex);
  return Array.from(gens.get(genNum).species).filter((pokemon) =>
    evaluate(ast, pokemon)
  );
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
function evaluate(node: ASTNode | undefined, data: Specie): boolean {
  if (node) {
    switch (node.type) {
      case "LogicalExpression":
        if (node.operator === "and") {
          return evaluate(node.left, data) && evaluate(node.right!, data);
        }
        if (node.operator === "or") {
          return evaluate(node.left, data) || evaluate(node.right!, data);
        }
        break;
      case "BinaryExpression":
        let leftValue: any;
        let rightValue: any;

        switch (node.left!.value) {
          case "bst":
            leftValue =
              data.baseStats.hp +
              data.baseStats.atk +
              data.baseStats.def +
              data.baseStats.spa +
              data.baseStats.spd +
              data.baseStats.spe;
            break;
          case "hp":
            leftValue = data.baseStats.hp;
            break;
          case "atk":
            leftValue = data.baseStats.atk;
            break;
          case "def":
            leftValue = data.baseStats.def;
            break;
          case "spa":
            leftValue = data.baseStats.spa;
            break;
          case "spd":
            leftValue = data.baseStats.spd;
            break;
          case "spe":
            leftValue = data.baseStats.spe;
            break;
          case "weaks":
            leftValue = newgetWeak(data);
            break;
          case "resists":
            leftValue = newgetResists(data);
            break;
          case "immunities":
            leftValue = newgetImmune(data);
            break;
          case "coverage":
          case "moveset":
            leftValue = [];
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
              tiers.indexOf(data.tier) > 0
                ? tiers.indexOf(data.tier)
                : data.tier;
            rightValue =
              tiers.indexOf(node.right?.value) > 0
                ? tiers.indexOf(node.right?.value)
                : node.right?.value;
            break;
          default:
            if (node.left) {
              if (node.left.value in data) {
                leftValue = data[node.left!.value as keyof Specie];
              } else {
                console.log(`Data does not have value ${node.left.value}`);
              }
            }
        }

        if (rightValue === undefined) {
          switch (node.right!.value) {
            case "false":
              rightValue = false;
              break;
            case "true":
              rightValue = true;
              break;
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
        return !!data[node.value as keyof Specie];
      case "Literal":
        return node.value;
    }
  }
  return false;
}
