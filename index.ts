import { Hono } from "hono";
import { cors } from "hono/cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

type Env = {
  GEMINI_API_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use("/*", cors()); 

app.get("/", (c) => {
  return c.json({ message: "Server is running" });
});

app.post("/calculate", async (c) => {
  try {
    const GEMINI_API_KEY = c.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY || GEMINI_API_KEY === "your_gemini_api_key_here") {
      console.error(
        "FATAL ERROR: GEMINI_API_KEY is not set in the Worker's environment secrets.",
      );
      return c.json(
        {
          message: "Server configuration error: GEMINI_API_KEY is not set.",
          status: "error",
        },
        500,
      );
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

    const body = await c.req.json();
    const { image, dict_of_vars } = body;

    if (!image || typeof image !== "string") {
      return c.json(
        {
          message: "Image data is required and must be a string.",
          status: "error",
        },
        400,
      );
    }
    if (!dict_of_vars || typeof dict_of_vars !== "object") {
      return c.json(
        {
          message: "dict_of_vars is required and must be an object.",
          status: "error",
        },
        400,
      );
    }

    const base64Data = image.split(",")[1] || image;
    const dictOfVarsStr = JSON.stringify(dict_of_vars);

    const prompt = `
You have been given an image with some mathematical expressions, equations, or graphical problems, and you need to solve them.
Note: Use the PEMDAS rule for solving mathematical expressions. PEMDAS stands for the Priority Order: Parentheses, Exponents, Multiplication and Division (from left to right), Addition and Subtraction (from left to right). Parentheses have the highest priority, followed by Exponents, then Multiplication and Division, and lastly Addition and Subtraction.
For example:
Q. 2 + 3 * 4
(3 * 4) => 12, 2 + 12 = 14.
Q. 2 + 3 + 5 * 4 - 8 / 2
5 * 4 => 20, 8 / 2 => 4, 2 + 3 => 5, 5 + 20 => 25, 25 - 4 => 21.
YOU CAN HAVE FIVE TYPES OF EQUATIONS/EXPRESSIONS IN THIS IMAGE. SOLVE ALL EQUATIONS/EXPRESSIONS YOU FIND IN THE IMAGE:
Following are the cases:
1. Simple mathematical expressions like 2 + 2, 3 * 4, 5 / 6, 7 - 8, etc.: In this case, solve and return the answer in the format of a LIST OF DICTS [{"expr": "given expression", "result": "calculated answer"}]. IF MULTIPLE EXPRESSIONS ARE PRESENT, RETURN ONE DICT FOR EACH EXPRESSION.
2. Set of Equations like x^2 + 2x + 1 = 0, 3y + 4x = 0, 5x^2 + 6y + 7 = 12, etc.: In this case, solve for the given variable, and the format should be a COMMA SEPARATED LIST OF DICTS, with dict 1 as {"expr": "x", "result": 2, "assign": true} and dict 2 as {"expr": "y", "result": 5, "assign": true}. This example assumes x was calculated as 2, and y as 5. Include as many dicts as there are variables.
3. Assigning values to variables like x = 4, y = 5, z = 6, etc.: In this case, assign values to variables and return another key in the dict called {"assign": true}, keeping the variable as 'expr' and the value as 'result' in the original dictionary. RETURN AS A LIST OF DICTS.
4. Analyzing Graphical Math problems, which are word problems represented in drawing form, such as cars colliding, trigonometric problems, problems on the Pythagorean theorem, adding runs from a cricket wagon wheel, etc. These will have a drawing representing some scenario and accompanying information with the image. PAY CLOSE ATTENTION TO DIFFERENT COLORS FOR THESE PROBLEMS. You need to return the answer in the format of a LIST OF DICTS [{"expr": "given expression", "result": "calculated answer"}]. IF MULTIPLE PROBLEMS ARE PRESENT, SOLVE ALL OF THEM.
5. Detecting Abstract Concepts that a drawing might show, such as love, hate, jealousy, patriotism, or a historic reference to war, invention, discovery, quote, etc. USE THE SAME FORMAT AS OTHERS TO RETURN THE ANSWER, where 'expr' will be the explanation of the drawing, and 'result' will be the abstract concept.
Analyze ALL equations or expressions in this image and return the answer according to the given rules. If you find multiple expressions or equations, solve ALL of them and return one result object for each:
Make sure to use extra backslashes for escape characters like \\f -> \\\\f, \\n -> \\\\n, etc.
Here is a dictionary of user-assigned variables. If the given expression has any of these variables, use its actual value from this dictionary accordingly: ${dictOfVarsStr}.
DO NOT USE BACKTICKS OR MARKDOWN FORMATTING.
PROPERLY QUOTE THE KEYS AND VALUES IN THE DICTIONARY FOR EASIER PARSING. The result MUST be a valid JSON parsable array of objects.
IMPORTANT: For equations like 7x + 5 = 0, return [{"expr": "7x + 5 = 0", "result": "x = -0.7143", "assign": true}].
Always convert fractions to decimal format in the result field. Use string values for all result fields.
`;

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: "image/png",
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = result.response;
    const text = response.text();
    console.log(`Gemini response: ${text}`);

    let answers = [];
    try {
      answers = JSON.parse(text);
    } catch (e) {
      console.error(`Error parsing response from Gemini API: ${e}`);
      let cleanedText = text.replace(/^```json\n?|```$/gm, "").trim();

      cleanedText = cleanedText
        .replace(/{\s*"result":\s*{([^}]+)}\s*}/g, (match, content) => {
          const simplified = content.replace(/"/g, "").trim();
          return match.replace(`{${content}}`, `"${simplified}"`);
        })
        .replace(/(\d+)\/(\d+)/g, (match, num, den) => {
          const decimal = (parseFloat(num) / parseFloat(den)).toFixed(4);
          return `"${decimal}"`;
        });

      try {
        answers = JSON.parse(cleanedText);
      } catch (e2) {
        console.error(`Error parsing cleaned response from Gemini API: ${e2}`);
        console.error(`Cleaned text: ${cleanedText}`);

        const exprMatch = text.match(/"expr":\s*"([^"]+)"/);
        const resultMatch = text.match(/"result":\s*([^,}]+)/);

        if (exprMatch && resultMatch) {
          let resultValue = resultMatch[1].trim();
          resultValue = resultValue.replace(/[{}]/g, "").replace(/"/g, "");

          answers = [
            {
              expr: exprMatch[1],
              result: resultValue,
              assign: text.includes('"assign": true'),
            },
          ];
        } else {
          return c.json(
            {
              message: "Failed to parse response from AI model.",
              error: (e2 as Error).message,
              raw_response: text.substring(0, 200) + "...",
            },
            500,
          );
        }
      }
    }

    if (!Array.isArray(answers)) {
      answers = answers ? [answers] : [];
    }

    const processedAnswers = answers.map((answer) => {
      if (typeof answer === "object" && answer !== null) {
        let result = answer.result;

        if (typeof result === "object") {
          if (result.x !== undefined) {
            result = `x = ${result.x}`;
          } else if (result.y !== undefined) {
            result = `y = ${result.y}`;
          } else {
            result = JSON.stringify(result);
          }
        } else if (typeof result === "string" && result.includes("/")) {
          const parts = result.split("/");
          if (
            parts.length === 2 &&
            !isNaN(parseFloat(parts[0])) &&
            !isNaN(parseFloat(parts[1]))
          ) {
            const decimal = (
              parseFloat(parts[0]) / parseFloat(parts[1])
            ).toFixed(4);
            result = `${result} ≈ ${decimal}`;
          }
        }

        return {
          expr: String(answer.expr || "Expression"),
          result: String(result || "No result"),
          assign: !!answer.assign,
        };
      }
      return {
        expr: "Invalid item in response",
        result: String(answer),
        assign: false,
      };
    });

    if (processedAnswers.length === 0 && text.length > 0) {
      return c.json({
        message:
          "Image processed, but no valid parsable data found in AI response.",
        data: [
          {
            expr: "Raw AI Response",
            result: text.substring(0, 500) + "...",
            assign: false,
          },
        ],
        status: "warning",
      });
    }

    return c.json({
      message: "Image processed",
      data:
        processedAnswers.length > 0
          ? processedAnswers
          : [
              {
                expr: "No equation detected",
                result: "Please draw a clearer mathematical expression",
                assign: false,
              },
            ],
      status: "success",
    });
  } catch (error) {
    console.error("Error in /calculate route:", error);
    return c.json(
      {
        message: "Failed to process image",
        error: (error as Error).message,
        status: "error",
      },
      500,
    );
  }
});

export default app;
