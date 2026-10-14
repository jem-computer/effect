/**
 * Defines decisions that a `DecisionModel` answers over a single input.
 * Pair an input schema with named classification, rating, probability, or
 * locate decisions using `make`, then answer them with `DecisionModel.decide`.
 *
 * @see {@link make} for building a definition from an input schema and decisions
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Base64 from "../encoding/Base64.ts"
import * as Predicate from "../Predicate.ts"
import type * as Schema from "../Schema.ts"

/**
 * Brand type for decision definitions.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/ai/Decision"

/**
 * Brand for decision definitions.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/ai/Decision"

/**
 * Decision instructions or descriptions: a string, JSON object, or JSON array.
 *
 * **Details**
 *
 * TypeScript interfaces lack the index signature required by `Schema.JsonObject`;
 * use object literals, type aliases, or Schema types instead.
 *
 * @stability unstable
 * @category models
 * @since 4.0.5
 */
export type Description = string | Schema.JsonObject | Schema.JsonArray

/**
 * Property key that marks an {@link InlineImage}.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.5
 */
export const InlineImageKey = "~effect/ai/Decision/InlineImage"

/**
 * An image placed inside instructions or criteria, such as an example picture
 * for a classification label. Create it with {@link image}.
 *
 * **Details**
 *
 * An inline image is plain JSON, so it fits anywhere a {@link Description}
 * does, including nested inside objects and arrays. Models created with
 * `supportsInlineImages: true` receive it in place. For other image-capable
 * models, `DecisionModel` moves it to the images sent with the input and
 * leaves a `[image N]` reference in its place. Models without image support
 * reject it.
 *
 * @stability unstable
 * @category models
 * @since 4.0.5
 */
export type InlineImage = {
  readonly "~effect/ai/Decision/InlineImage":
    | { readonly mediaType: string; readonly base64: string }
    | { readonly mediaType: string; readonly url: string }
}

/**
 * Decision that assigns the input one label out of a set of criteria.
 * `criteria` maps labels to descriptions; use `null` for a label without a description.
 *
 * @see {@link classify} for the constructor
 * @see {@link ClassifyAnswer} for the answer produced by this decision
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Classify<Label extends string> {
  readonly _tag: "Classify"
  readonly instructions: Description
  readonly criteria: { readonly [L in Label]: Description | null }
}

/**
 * Decision that places the input on an ordered scale of criteria.
 * `criteria` lists levels from lowest to highest, with labels for answers and
 * descriptions for the provider.
 *
 * @see {@link rate} for the constructor
 * @see {@link RateAnswer} for the answer produced by this decision
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Rate<Level extends string> {
  readonly _tag: "Rate"
  readonly instructions: Description
  readonly criteria: ReadonlyArray<{ readonly label: Level; readonly description: Description }>
}

/**
 * Decision that estimates how likely a statement about the input is to hold.
 * Optional `criteria` describes both outcomes when supplied.
 * The answer is the probability of `true`.
 *
 * @see {@link probability} for the constructor
 * @see {@link ProbabilityAnswer} for the answer produced by this decision
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Probability {
  readonly _tag: "Probability"
  readonly instructions: Description
  readonly criteria?: {
    readonly false: Description
    readonly true: Description
  } | undefined
}

/**
 * Decision that finds where something is in an image supplied with the input.
 * The answer is a bounding box around one target.
 *
 * @see {@link locate} for the constructor
 * @see {@link LocateAnswer} for the answer produced by this decision
 *
 * @stability unstable
 * @category models
 * @since 4.0.5
 */
export interface Locate {
  readonly _tag: "Locate"
  readonly instructions: Description
}

/**
 * Union of every decision kind.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Any = Classify<string> | Rate<string> | Probability | Locate

/**
 * Answer to a {@link Classify} decision.
 * `label` is chosen by the provider and need not have the highest probability.
 * `confidence` is an optional, provider-defined measure in `[0, 1]`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ClassifyAnswer<Label extends string> {
  readonly label: Label
  readonly probabilities: { readonly [L in Label]: number }
  readonly confidence?: number | undefined
}

/**
 * Answer to a {@link Rate} decision.
 * `rating` is the probability-weighted position on the scale and may fall
 * between two levels, within `[0, criteria.length - 1]`. `label` is the label
 * of the level with the highest probability, choosing the first criteria entry
 * on ties.
 * `confidence` is an optional, provider-defined measure in `[0, 1]`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RateAnswer<Level extends string> {
  readonly rating: number
  readonly label: Level
  readonly probabilities: { readonly [L in Level]: number }
  readonly confidence?: number | undefined
}

/**
 * Answer to a {@link Probability} decision.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ProbabilityAnswer {
  readonly probability: number
}

/**
 * Smallest rectangle that contains a located target. Each edge is a fraction
 * of the image's size measured from the top-left corner: `left` and `right`
 * of its width, `top` and `bottom` of its height. Edges are in `[0, 1]`, with
 * `left <= right` and `top <= bottom`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.5
 */
export interface BoundingBox {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/**
 * Answer to a {@link Locate} decision.
 * There is no "not found" answer: a target absent from the image still gets a
 * box. Pair the decision with a {@link Probability} that the target is present.
 * `confidence` is an optional, provider-defined measure in `[0, 1]`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.5
 */
export interface LocateAnswer {
  readonly box: BoundingBox
  readonly confidence?: number | undefined
}

/**
 * Answer type for a single decision.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Answer<D extends Any> = D extends Classify<infer Label> ? ClassifyAnswer<Label>
  : D extends Rate<infer Level> ? RateAnswer<Level>
  : D extends Probability ? ProbabilityAnswer
  : D extends Locate ? LocateAnswer
  : never

/**
 * Answers keyed by decision name.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Answers<Decisions extends Record<string, Any>> = {
  readonly [K in keyof Decisions]: Answer<Decisions[K]>
}

/**
 * Input schema and named decisions that run together in one provider call.
 *
 * @see {@link make} for the constructor
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Definition<Input extends Schema.Constraint, Decisions extends Record<string, Any>> {
  readonly [TypeId]: TypeId
  readonly input: Input
  readonly decisions: Decisions
}

/**
 * Creates a classification decision from labelled criteria.
 * Descriptions can be `null` when the label needs no explanation.
 * Throws if fewer than two labels are supplied.
 *
 * **Example** (Choosing a department)
 *
 * ```ts
 * import { Decision } from "effect/ai"
 *
 * const department = Decision.classify({
 *   instructions: "Which team should handle this",
 *   criteria: {
 *     billing: "payments",
 *     technical: "bugs",
 *     sales: "pricing"
 *   }
 * })
 * ```
 *
 * @see {@link rate} for an ordered scale
 * @see {@link probability} for a single yes or no likelihood
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const classify = <Label extends string>(options: {
  readonly instructions: Description
  readonly criteria: { readonly [L in Label]: Description | null }
}): Classify<Label> => {
  if (Object.keys(options.criteria).length < 2) {
    throw new Error("Decision.classify: criteria must contain at least two labels")
  }
  return {
    _tag: "Classify",
    instructions: options.instructions,
    criteria: options.criteria
  }
}

/**
 * Creates a rating decision from an ordered list of criteria.
 * Strings serve as both label and description; use `{ label, description }`
 * to separate them. Answers use the label.
 * Throws if fewer than two levels or duplicate labels are supplied.
 *
 * **Example** (Rating frustration)
 *
 * ```ts
 * import { Decision } from "effect/ai"
 *
 * const frustration = Decision.rate({
 *   instructions: "How frustrated",
 *   criteria: ["calm", "frustrated", "angry"]
 * })
 * ```
 *
 * **Example** (Describing levels with structure)
 *
 * ```ts
 * import { Decision } from "effect/ai"
 *
 * const severity = Decision.rate({
 *   instructions: "How severe is the reported issue?",
 *   criteria: [
 *     "cosmetic",
 *     {
 *       label: "degraded",
 *       description: {
 *         what: "Broken or degraded feature, but workaround exists",
 *         examples: ["export fails in one browser but works in another"]
 *       }
 *     },
 *     {
 *       label: "blocking",
 *       description: {
 *         what: "Blocking issue; no workaround exists",
 *         examples: ["cannot log in", "data loss"]
 *       }
 *     }
 *   ]
 * })
 * ```
 *
 * @see {@link classify} for unordered labels
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const rate = <const Level extends string>(options: {
  readonly instructions: Description
  readonly criteria: ReadonlyArray<Level | { readonly label: Level; readonly description: Description }>
}): Rate<Level> => {
  if (options.criteria.length < 2) {
    throw new Error("Decision.rate: criteria must contain at least two levels")
  }
  const criteria = options.criteria.map((level) =>
    typeof level === "string" ? { label: level, description: level } : level
  )
  if (new Set(criteria.map((level) => level.label)).size !== criteria.length) {
    throw new Error("Decision.rate: criteria must contain distinct levels")
  }
  return {
    _tag: "Rate",
    instructions: options.instructions,
    criteria
  }
}

/**
 * Creates a probability decision from instructions and optional outcome descriptions.
 * When `criteria` is supplied, descriptions for both `false` and `true` are required.
 *
 * **Example** (Estimating urgency)
 *
 * ```ts
 * import { Decision } from "effect/ai"
 *
 * const urgent = Decision.probability({
 *   instructions: "The message is time-sensitive"
 * })
 * ```
 *
 * **Example** (Providing outcome descriptions)
 *
 * ```ts
 * import { Decision } from "effect/ai"
 *
 * const urgent = Decision.probability({
 *   instructions: "The message is time-sensitive",
 *   criteria: {
 *     false: "The message can wait",
 *     true: "The message needs immediate attention"
 *   }
 * })
 * ```
 *
 * @see {@link classify} for more than two outcomes
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const probability = (options: {
  readonly instructions: Description
  readonly criteria?: {
    readonly false: Description
    readonly true: Description
  } | undefined
}): Probability => ({
  _tag: "Probability",
  instructions: options.instructions,
  criteria: options.criteria
})

/**
 * Creates a decision that finds one target in the images passed to
 * `DecisionModel.decide`. Name the target, and the image when there are
 * several. The model must be created with `supportsLocate: true`, and the
 * call must include at least one image.
 *
 * **Example** (Finding a mug in a photo)
 *
 * ```ts
 * import { Schema } from "effect"
 * import { Decision } from "effect/ai"
 *
 * const FindMug = Decision.make({
 *   input: Schema.String,
 *   decisions: {
 *     present: Decision.probability({ instructions: "The photo shows a coffee mug" }),
 *     mug: Decision.locate({ instructions: "the coffee mug in the photo" })
 *   }
 * })
 * ```
 *
 * @see {@link LocateAnswer} for the answer
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.5
 */
export const locate = (options: {
  readonly instructions: Description
}): Locate => ({
  _tag: "Locate",
  instructions: options.instructions
})

/**
 * Creates an image to place inside instructions or criteria.
 * Byte arrays are base64-encoded once, when the image is created.
 *
 * **Example** (Defining labels by example pictures)
 *
 * ```ts
 * import { Decision } from "effect/ai"
 *
 * declare const thumbsUpPng: Uint8Array
 * declare const openPalmPng: Uint8Array
 *
 * const gesture = Decision.classify({
 *   instructions: "Which gesture is the hand in the photo making?",
 *   criteria: {
 *     thumbs_up: Decision.image({ mediaType: "image/png", data: thumbsUpPng }),
 *     open_palm: {
 *       description: "A hand held up with the palm facing the camera",
 *       examples: [Decision.image({ mediaType: "image/png", data: openPalmPng })]
 *     },
 *     none: "No hand, or a gesture unlike the examples"
 *   }
 * })
 * ```
 *
 * @see {@link InlineImage} for how models receive it
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.5
 */
export const image = (options: {
  readonly mediaType: string
  readonly data: string | Uint8Array | URL
}): InlineImage => ({
  [InlineImageKey]: options.data instanceof URL
    ? { mediaType: options.mediaType, url: options.data.href }
    : {
      mediaType: options.mediaType,
      base64: typeof options.data === "string" ? options.data : Base64.encode(options.data)
    }
})

/**
 * Checks whether a value is an {@link InlineImage}.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.5
 */
export const isInlineImage = (u: unknown): u is InlineImage => {
  if (!Predicate.isObject(u) || Object.keys(u).length !== 1) return false
  const image = u[InlineImageKey]
  return Predicate.isObject(image) && Predicate.isString(image.mediaType) &&
    (Predicate.isString(image.base64) || Predicate.isString(image.url))
}

/**
 * Replaces every {@link InlineImage} in a description, at any depth, with the
 * string returned by `f`. URL images are passed to `f` as `URL`s and others as
 * base64 strings. Other values are copied unchanged.
 *
 * @stability unstable
 * @category utils
 * @since 4.0.5
 */
export const mapImages: {
  (
    description: Description,
    f: (image: { readonly mediaType: string; readonly data: string | URL }) => string
  ): Description
  (
    description: Description | null,
    f: (image: { readonly mediaType: string; readonly data: string | URL }) => string
  ): Description | null
} = (
  description: Description | null,
  f: (image: { readonly mediaType: string; readonly data: string | URL }) => string
): any => {
  const go = (value: Schema.Json): Schema.Json => {
    if (isInlineImage(value)) {
      const image = value[InlineImageKey]
      return f({ mediaType: image.mediaType, data: "url" in image ? new URL(image.url) : image.base64 })
    }
    if (Array.isArray(value)) return value.map(go)
    if (Predicate.isObject(value)) {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, go(v as Schema.Json)]))
    }
    return value
  }
  return go(description)
}

/**
 * Creates a decision definition from an input schema and named decisions.
 * `DecisionModel.decide` encodes the input with `Schema.toCodecJson` before
 * calling the provider. Answer keys and types are inferred from the decisions.
 * Throws if `decisions` is empty.
 *
 * **Example** (Defining ticket triage)
 *
 * ```ts
 * import { Schema } from "effect"
 * import { Decision } from "effect/ai"
 *
 * const Ticket = Schema.Struct({
 *   subject: Schema.String,
 *   body: Schema.String
 * })
 *
 * const TicketTriage = Decision.make({
 *   input: Ticket,
 *   decisions: {
 *     department: Decision.classify({
 *       instructions: "Which team should handle this",
 *       criteria: { billing: "payments", technical: "bugs" }
 *     }),
 *     urgent: Decision.probability({
 *       instructions: "The message is time-sensitive",
 *       criteria: { false: "No time pressure", true: "Needs action now" }
 *     })
 *   }
 * })
 * ```
 *
 * @see {@link Definition} for the returned shape
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <Input extends Schema.Constraint, Decisions extends Record<string, Any>>(options: {
  readonly input: Input
  readonly decisions: Decisions
}): Definition<Input, Decisions> => {
  if (Object.keys(options.decisions).length === 0) {
    throw new Error("Decision.make: decisions must not be empty")
  }
  return {
    [TypeId]: TypeId,
    input: options.input,
    decisions: options.decisions
  }
}
