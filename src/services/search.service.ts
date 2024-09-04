import { ID } from "@pkmn/data";
import { DraftSpecies, Pokemon } from "../classes/pokemon";
import { getRuleset, RulesetId } from "../data/rulesets";

type Token = { type: string; value: string };
type ASTNode = {
  type: string;
  left?: ASTNode;
  right?: ASTNode;
  value?: any;
  operator?: string;
  cache?: (boolean | Pokemon)[];
};

let cache: [ASTNode, (boolean | Pokemon)[]][] = [];

export async function searchPokemon(
  query: string,
  rulesetId: RulesetId = "Gen9 NatDex"
) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const ast = parse(tokens);
  // let cachedData = checkCache(ast);
  // if (cachedData) {
  //   return cachedData[1];
  // } else {
  let ruleset = getRuleset(rulesetId);
  let searchResults = await Promise.all(
    Array.from(ruleset.gen.species).map(async (specie) => {
      let pokemon = new DraftSpecies(specie, {}, ruleset);
      return [
        {
          id: pokemon.id,
          name: pokemon.name,
          types: pokemon.types,
          abilities: Object.values(pokemon.abilities),
          baseStats: pokemon.baseStats,
          weightkg: pokemon.weightkg,
          tier: pokemon.tier,
          doublesTier: pokemon.doublesTier,
          eggGroups: pokemon.eggGroups,
          nfe: pokemon.nfe,
          num: pokemon.num,
          tags: pokemon.tags,
          bst: pokemon.bst,
        },
        await evaluate(ast, pokemon),
      ];
    })
  );
  let filteredResults = searchResults
    .filter((result) => result[1])
    .map((result) => result[0]);
  cache.push([ast, filteredResults]);
  return filteredResults;
  // }
}

function checkCache(node: ASTNode) {
  for (let cachedNode of cache) {
    subNodes(node, cachedNode);
    if (sameNodes(node, cachedNode[0])) return cachedNode[1];
  }
  return undefined;
}

function subNodes(
  subNode: ASTNode | undefined,
  cachedData: [ASTNode, (boolean | Pokemon)[]]
): boolean {
  if (!subNode) return false;
  if (sameNodes(subNode, cachedData[0])) {
    subNode.cache = cachedData[1];
    return true;
  }
  return (
    (subNode.left !== undefined && subNodes(subNode.left, cachedData)) ||
    (subNode.right !== undefined && subNodes(subNode.right, cachedData))
  );
}

function sameNodes(
  nodeA: ASTNode | undefined,
  nodeB: ASTNode | undefined
): boolean {
  if (nodeA === undefined && nodeB === undefined) return true;
  if (nodeA === undefined || nodeB === undefined) return false;
  if (!sameNodes(nodeA.left, nodeB.left)) return false;
  if (!sameNodes(nodeA.right, nodeB.right)) return false;
  if (nodeA.type != nodeB.type) return false;
  switch (nodeA.type) {
    case "Literal":
    case "Identifier":
      return nodeA.value === nodeB.value;
    case "LogicalExpression":
    case "BinaryExpression":
      return nodeA.operator === nodeB.operator;
  }
  return false;
}

function tokenize(input: string): Token[] {
  const regex =
    /\s*(=>|!=|>=|<=|>|<|=|∈|∉|&&|\|\||includes|!includes|\(|\)|and|or|'[^']*'|[A-Za-z_][A-Za-z0-9_]*|"[^"]*"|\d+|\S)\s*/g;
  const tokens: Token[] = [];
  let match;
  while ((match = regex.exec(input)) !== null) {
    tokens.push({ type: match[0].trim(), value: match[0].trim() });
  }
  return tokens;
}

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

    if (["and", "&&", "||", "or"].includes(token.type)) {
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
      ["and", "&&", "||", "or"].includes(tokens[current].type)
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

async function evaluate(
  node: ASTNode | undefined,
  pokemon: DraftSpecies
): Promise<boolean> {
  if (node) {
    const tiers = [
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
      "Uber",
      "AG",
    ];
    switch (node.type) {
      case "LogicalExpression":
        if (node.operator === "and" || node.operator === "&&") {
          return (
            (await evaluate(node.left, pokemon)) &&
            (await evaluate(node.right!, pokemon))
          );
        }
        if (node.operator === "or" || node.operator === "||") {
          return (
            (await evaluate(node.left, pokemon)) ||
            (await evaluate(node.right!, pokemon))
          );
        }
        break;
      case "BinaryExpression":
        let leftValue: any;
        let rightValue: any;
        switch (node.left!.value) {
          case "name":
            leftValue = pokemon.name;
            break;
          case "bst":
            leftValue = pokemon.bst;
            break;
          case "hp":
            leftValue = pokemon.baseStats.hp;
            break;
          case "atk":
            leftValue = pokemon.baseStats.atk;
            break;
          case "def":
            leftValue = pokemon.baseStats.def;
            break;
          case "spa":
            leftValue = pokemon.baseStats.spa;
            break;
          case "spd":
            leftValue = pokemon.baseStats.spd;
            break;
          case "spe":
            leftValue = pokemon.baseStats.spe;
            break;
          case "weaks":
            leftValue = pokemon.getWeak();
            break;
          case "resists":
            leftValue = pokemon.getResists();
            break;
          case "immunities":
            leftValue = pokemon.getImmune();
            break;
          case "coverage":
            leftValue = Object.keys(
              (await pokemon.ruleset.gen.learnsets.learnable(pokemon.id)) || {}
            )
              .map((moveid) =>
                pokemon.ruleset.gen.dex.moves.getByID(moveid as ID)
              )
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
            leftValue = (await pokemon.learns(node.right?.value))
              ? node.right?.value
              : "";
            break;
          case "abilities":
            leftValue = Object.values(pokemon.abilities);
            break;
          case "tier":
            leftValue =
              tiers.indexOf(pokemon.tier) > 0
                ? tiers.indexOf(pokemon.tier)
                : pokemon.tier;
            rightValue =
              tiers.indexOf(node.right?.value) > 0
                ? tiers.indexOf(node.right?.value)
                : node.right?.value;
            break;
          case "doubles-tier":
            leftValue =
              tiers.indexOf(pokemon.doublesTier) > 0
                ? tiers.indexOf(pokemon.doublesTier)
                : pokemon.doublesTier;
            rightValue =
              tiers.indexOf(node.right?.value) > 0
                ? tiers.indexOf(node.right?.value)
                : node.right?.value;
            break;
          case "nfe":
            leftValue = pokemon.nfe;
            break;
          case "dexNum":
            leftValue = pokemon.num;
            rightValue = +node.right?.value;
            break;
          case "tags":
            let tags = [
              "Paradox",
              "Sub-Legendary",
              "Mythical",
              "Restricted Legendary",
            ];
            leftValue = pokemon.tags
              .map((tag) => tags.indexOf(tag))
              .reduce((max, i) => (max = i > max ? i : max), -1);
            rightValue = tags.indexOf(node.right?.value);
            break;
          case "type":
          case "types":
            leftValue = pokemon.types;
            break;
          case "gen":
            leftValue = pokemon.gen;
            rightValue = +node.right?.value;
            break;
          case "weight":
            leftValue = pokemon.weightkg;
            break;
          case "egg-groups":
            leftValue = pokemon.eggGroups;
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
            case "∈":
              return leftValue.some(
                (value) => value.toLowerCase() === rightValue.toLowerCase()
              );
            case "!includes":
            case "∉":
              return !leftValue.some(
                (value) => value.toLowerCase() === rightValue.toLowerCase()
              );
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
            case "includes":
            case "∈":
              return leftValue.toLowerCase().includes(rightValue.toLowerCase());
            case "!includes":
            case "∉":
              return !leftValue
                .toLowerCase()
                .includes(rightValue.toLowerCase());

            default:
              console.log(
                `Parsing error: invalid string binary operator "${node.operator}"`
              );
          }
        }
        break;
      case "Identifier":
        return !!pokemon[node.value as keyof DraftSpecies];
      case "Literal":
        return node.value;
    }
  }
  return false;
}
