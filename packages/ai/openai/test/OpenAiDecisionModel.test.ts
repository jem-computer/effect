import { OpenAiClient } from "@effect/ai-openai"
import * as OpenAiDecisionModel from "@effect/ai-openai/OpenAiDecisionModel"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Redacted, Schema } from "effect"
import { Decision, DecisionModel, Model } from "effect/ai"
import { HttpClient, type HttpClientError, type HttpClientRequest, HttpClientResponse } from "effect/http"

const Triage = Decision.make({
  input: Schema.Struct({ message: Schema.String }),
  decisions: {
    team: Decision.classify({
      instructions: "Which team should handle this request?",
      criteria: { billing: "Payments", technical: "Outages" }
    }),
    severity: Decision.rate({
      instructions: "How severe is the impact?",
      criteria: ["Minor", "Major", "Critical"]
    }),
    urgent: Decision.probability({
      instructions: "Does this need immediate attention?",
      criteria: { false: "Can wait", true: "Act now" }
    })
  }
})

const Urgency = Decision.make({
  input: Schema.String,
  decisions: {
    urgent: Decision.probability({ instructions: "Does this need immediate attention?" })
  }
})

const input = { message: "Checkout is down" }

const answers = [
  {
    name: "team",
    type: "choice",
    choice: "technical",
    probabilities: [{ value: "billing", probability: 0.1 }, { value: "technical", probability: 0.9 }],
    confidence: 0.9
  },
  {
    name: "severity",
    type: "score",
    score: 1.75,
    probabilities: [
      { value: 0, label: "minor", probability: 0.05 },
      { value: 1, label: "major", probability: 0.15 },
      { value: 2, label: "critical", probability: 0.8 }
    ],
    confidence: 0.8
  },
  { name: "urgent", type: "predicate", probability: 0.99 }
]

const response = (
  answers: ReadonlyArray<unknown>,
  fields: object = { usage: { input_tokens: 120, output_tokens: 0 } }
) => ({ id: "dec_123", object: "decision", model: "gpt-6-luna", answers, ...fields })

const clientLayer = (
  body: unknown,
  onRequest: (request: HttpClientRequest.HttpClientRequest) => void = () => {}
) =>
  OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
    Layer.provide(Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.makeWith(
        Effect.map((request) => {
          onRequest(request)
          return HttpClientResponse.fromWeb(request, Response.json(body))
        }),
        Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
      )
    ))
  )

const layer = (body: unknown) =>
  OpenAiDecisionModel.layer({ model: "gpt-6-luna" }).pipe(Layer.provide(clientLayer(body)))

const requestBody = (request: HttpClientRequest.HttpClientRequest) => {
  assert.strictEqual(request.body._tag, "Uint8Array")
  return request.body._tag === "Uint8Array" ? JSON.parse(new TextDecoder().decode(request.body.body)) : undefined
}

describe("OpenAiDecisionModel", () => {
  it.effect("sends every decision as a named question and keys the answers by name", () =>
    Effect.gen(function*() {
      const result = yield* DecisionModel.decide(Triage, { input })
      assert.strictEqual(yield* Model.ProviderName, "openai")
      assert.strictEqual(yield* Model.ModelName, "gpt-6-luna")
      assert.strictEqual(result.answers.team.label, "technical")
      assert.deepStrictEqual({ ...result.answers.team.probabilities }, { billing: 0.1, technical: 0.9 })
      assert.strictEqual(result.answers.team.confidence, 0.9)
      assert.strictEqual(result.answers.severity.label, "Critical")
      assert.strictEqual(result.answers.severity.rating, 1.75)
      assert.deepStrictEqual({ ...result.answers.severity.probabilities }, { Minor: 0.05, Major: 0.15, Critical: 0.8 })
      assert.strictEqual(result.answers.severity.confidence, 0.8)
      assert.strictEqual(result.answers.urgent.probability, 0.99)
      assert.strictEqual(result.usage.inputTokens, 120)
      assert.strictEqual(result.usage.outputTokens, 0)
    }).pipe(
      Effect.provide(OpenAiDecisionModel.model("gpt-6-luna")),
      Effect.provide(clientLayer(response([...answers].reverse()), (request) => {
        assert.strictEqual(request.method, "POST")
        assert.strictEqual(request.url, "https://api.openai.com/v1/decisions")
        assert.deepStrictEqual(requestBody(request), {
          model: "gpt-6-luna",
          input: JSON.stringify(input),
          questions: [
            {
              type: "choice",
              name: "team",
              instructions: "Which team should handle this request?",
              choices: [
                { value: "billing", description: "Payments" },
                { value: "technical", description: "Outages" }
              ]
            },
            {
              type: "score",
              name: "severity",
              instructions: "How severe is the impact?",
              levels: [
                { label: "Minor", description: "Minor" },
                { label: "Major", description: "Major" },
                { label: "Critical", description: "Critical" }
              ]
            },
            {
              type: "predicate",
              name: "urgent",
              instructions: "Does this need immediate attention?\n\nfalse: Can wait\ntrue: Act now"
            }
          ]
        })
      }))
    ))

  it.effect("sends string state unchanged without images and leaves omitted usage undefined", () =>
    Effect.gen(function*() {
      const result = yield* DecisionModel.decide(Urgency, { input: "Checkout is down" })
      assert.isUndefined(result.usage.inputTokens)
      assert.isUndefined(result.usage.outputTokens)
    }).pipe(
      Effect.provide(OpenAiDecisionModel.layer({ model: "gpt-6-luna" })),
      Effect.provide(clientLayer(response([answers[2]], {}), (request) => {
        assert.strictEqual(requestBody(request).input, "Checkout is down")
      }))
    ))

  it.effect("fails with InvalidOutputError when an answer is missing", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(DecisionModel.decide(Triage, { input }))
      assert.strictEqual(error.reason._tag, "InvalidOutputError")
    }).pipe(Effect.provide(layer(response(answers.slice(0, 2))))))

  it.effect("fails the whole call with ContentPolicyError when any answer is a refusal", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(DecisionModel.decide(Triage, { input }))
      assert.strictEqual(error.reason._tag, "ContentPolicyError")
      if (error.reason._tag === "ContentPolicyError") {
        assert.include(error.reason.description, "severity")
        assert.notInclude(error.reason.description, "team")
        assert.include(JSON.stringify(error.reason.metadata.openai), "severity")
      }
    }).pipe(Effect.provide(layer(response([
      answers[0],
      { name: "severity", type: "refusal", refusal: "I can't help with that." },
      answers[2]
    ])))))

  it.effect("sends string and JSON state with byte array, base64 string, and data URL images", () => {
    const dataUrl = "data:image/webp;base64,UklGRg=="
    const images = [
      { mediaType: "image/png", data: new Uint8Array([137, 80, 78, 71]) },
      { mediaType: "image/jpeg", data: "/9j/4AAQ" },
      { mediaType: "image/webp", data: new URL(dataUrl) }
    ]
    const assertInput = (request: HttpClientRequest.HttpClientRequest, text: string) => {
      const body = requestBody(request)
      assert.strictEqual(body.input.length, 1)
      assert.strictEqual(body.input[0].role, "user")
      assert.deepStrictEqual(body.input[0].content, [
        { type: "input_text", text },
        { type: "input_image", image_url: "data:image/png;base64,iVBORw==" },
        { type: "input_image", image_url: "data:image/jpeg;base64,/9j/4AAQ" },
        { type: "input_image", image_url: dataUrl }
      ])
    }
    return Effect.gen(function*() {
      const result = yield* DecisionModel.decide(Urgency, {
        input: "Checkout is down",
        images
      })
      assert.strictEqual(result.answers.urgent.probability, 0.99)
      const jsonResult = yield* DecisionModel.decide(Triage, { input, images }).pipe(
        Effect.provide(OpenAiDecisionModel.layer({ model: "gpt-6-luna" })),
        Effect.provide(clientLayer(response(answers), (request) => {
          assertInput(request, "{\"message\":\"Checkout is down\"}")
        }))
      )
      assert.strictEqual(jsonResult.answers.urgent.probability, 0.99)
    }).pipe(
      Effect.provide(OpenAiDecisionModel.layer({ model: "gpt-6-luna" })),
      Effect.provide(clientLayer(response([answers[2]]), (request) => {
        const body = requestBody(request)
        assert.deepStrictEqual(body.questions, [
          { type: "predicate", name: "urgent", instructions: "Does this need immediate attention?" }
        ])
        assertInput(request, "Checkout is down")
      }))
    )
  })

  it.effect("rejects remote image URLs without sending a request", () => {
    let requests = 0
    return Effect.gen(function*() {
      const error = yield* Effect.flip(DecisionModel.decide(Urgency, {
        input: "Checkout is down",
        images: [{ mediaType: "image/png", data: new URL("https://example.com/cat.png") }]
      }))
      assert.strictEqual(error.reason._tag, "InvalidUserInputError")
      assert.strictEqual(requests, 0)
    }).pipe(
      Effect.provide(OpenAiDecisionModel.layer({ model: "gpt-6-luna" })),
      Effect.provide(clientLayer(response([answers[2]]), () => {
        requests++
      }))
    )
  })

  describe("structured descriptions", () => {
    // The pull request scope example from https://docs.typesafe.ai/primitives/advanced#structured-score-levels
    const prScopeInstructions = {
      question: "How focused is this pull request description on a single change?",
      note: "Judge the number of independent changes, not the size of any one change."
    }
    const prScopeLevels = [
      {
        label: "focused",
        description: {
          summary: "One change, clearly stated",
          signals: ["A single fix or feature", "Nothing described as \"also\" or \"while I was in there\""]
        }
      },
      {
        label: "tweak",
        description: {
          summary: "One main change plus a small related tweak",
          signals: ["A primary change and one minor adjacent edit", "The tweak supports the main change"]
        }
      },
      {
        label: "bundled",
        description: {
          summary: "Several independent changes bundled together",
          signals: ["Two or more unrelated fixes or features", "Changes that could each be their own PR"]
        }
      }
    ] as const

    it.effect("sends structured score instructions and levels as JSON text and maps answers to labels", () => {
      const definition = Decision.make({
        input: Schema.String,
        decisions: { pr_scope: Decision.rate({ instructions: prScopeInstructions, criteria: prScopeLevels }) }
      })
      return Effect.gen(function*() {
        const { answers } = yield* DecisionModel.decide(definition, { input: "Fixed the null check." })
        assert.strictEqual(answers.pr_scope.label, "bundled")
        assert.deepStrictEqual({ ...answers.pr_scope.probabilities }, { focused: 0.1, tweak: 0.2, bundled: 0.7 })
      }).pipe(
        Effect.provide(OpenAiDecisionModel.layer({ model: "gpt-6-luna" })),
        Effect.provide(clientLayer(
          response([{
            name: "pr_scope",
            type: "score",
            score: 1.6,
            probabilities: [
              { value: 0, label: "focused", probability: 0.1 },
              { value: 1, label: "tweak", probability: 0.2 },
              { value: 2, label: "bundled", probability: 0.7 }
            ],
            confidence: 0.6
          }]),
          (request) => {
            assert.deepStrictEqual(requestBody(request).questions, [{
              type: "score",
              name: "pr_scope",
              instructions: JSON.stringify(prScopeInstructions),
              levels: prScopeLevels.map(({ description, label }) => ({
                label,
                description: JSON.stringify(description)
              }))
            }])
          }
        ))
      )
    })

    it.effect("omits the description of a choice whose description is null", () => {
      const definition = Decision.make({
        input: Schema.String,
        decisions: {
          customer_name: Decision.classify({
            instructions: { question: "Which option is the customer name?" },
            criteria: { "Beaver Dam Logistics": null, "Dam Logistics": null, other: ["Any", "other", "name"] }
          })
        }
      })
      return Effect.gen(function*() {
        const { answers } = yield* DecisionModel.decide(definition, { input: "Invoice to Beaver Dam Logistics" })
        assert.strictEqual(answers.customer_name.label, "Beaver Dam Logistics")
      }).pipe(
        Effect.provide(OpenAiDecisionModel.layer({ model: "gpt-6-luna" })),
        Effect.provide(clientLayer(
          response([{
            name: "customer_name",
            type: "choice",
            choice: "Beaver Dam Logistics",
            probabilities: [
              { value: "Beaver Dam Logistics", probability: 0.9 },
              { value: "Dam Logistics", probability: 0.1 },
              { value: "other", probability: 0 }
            ],
            confidence: 0.9
          }]),
          (request) => {
            assert.deepStrictEqual(requestBody(request).questions, [{
              type: "choice",
              name: "customer_name",
              instructions: "{\"question\":\"Which option is the customer name?\"}",
              choices: [
                { value: "Beaver Dam Logistics" },
                { value: "Dam Logistics" },
                { value: "other", description: "[\"Any\",\"other\",\"name\"]" }
              ]
            }])
          }
        ))
      )
    })

    it.effect("appends structured probability criteria to the instructions as JSON text", () => {
      const instructions = { question: "Does the `message` ask for a credential?", inspect: "message" }
      const criteria = {
        false: { what: "No sensitive credential is requested", examples: ["Your statement is ready"] },
        true: { what: "Asks for a password, PIN, or one-time code", examples: ["Reply with your password"] }
      }
      const definition = Decision.make({
        input: Schema.String,
        decisions: { requests_credentials: Decision.probability({ instructions, criteria }) }
      })
      return Effect.gen(function*() {
        const { answers } = yield* DecisionModel.decide(definition, { input: "Reply with your login password." })
        assert.strictEqual(answers.requests_credentials.probability, 0.97)
      }).pipe(
        Effect.provide(OpenAiDecisionModel.layer({ model: "gpt-6-luna" })),
        Effect.provide(clientLayer(
          response([{ name: "requests_credentials", type: "predicate", probability: 0.97 }]),
          (request) => {
            assert.deepStrictEqual(requestBody(request).questions, [{
              type: "predicate",
              name: "requests_credentials",
              instructions: [
                JSON.stringify(instructions),
                "",
                `false: ${JSON.stringify(criteria.false)}`,
                `true: ${JSON.stringify(criteria.true)}`
              ].join("\n")
            }])
          }
        ))
      )
    })
  })
})
