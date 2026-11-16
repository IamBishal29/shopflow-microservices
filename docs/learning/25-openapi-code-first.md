# 25. OpenAPI, code-first: docs that can't drift silently

**In plain words.** OpenAPI is a machine-readable description of an HTTP API: paths,
parameters, bodies, responses and errors. Clients generate SDKs from it, testers import it,
and Swagger UI renders it as clickable docs. order-service now serves the UI at `/docs`
and the spec at `/docs-json`, generated at startup from the controllers and DTOs that
actually handle requests.

**Code-first vs contract-first.**

|                     | Code-first (ours)                   | Contract-first                                                 |
| ------------------- | ----------------------------------- | -------------------------------------------------------------- |
| Source of truth     | controllers + DTOs                  | the `openapi.yaml` file                                        |
| Spec generated from | decorators, at runtime              | hand-written YAML; code generated or checked against it        |
| Best when           | one team owns API and code          | many teams or external partners agree on the API before coding |
| Main risk           | docs only as good as the decorators | the code drifts from the YAML unless CI checks it              |

**How we stop drift (three layers).**

1. **Routes:** the spec is built from the registered controllers, so it can't list an
   endpoint that doesn't exist, or miss one.
2. **Types:** response schemas `implements` the domain types (`OrderResponse implements
Order`, `ProblemDetailsSchema implements ProblemDetails`). A new required domain field
   stops the build until the docs have it.
3. **Validation rules:** an e2e test compares each DTO's documented properties with the
   ones class-validator enforces. Deleting one `@ApiProperty` makes it fail and name the
   field (checked by hand while building this).

**Decisions (Syed's choices).** Explicit `@ApiProperty` decorators, not the Nest CLI
plugin: there's no build magic and Jest needs no AST transformer, at the cost of more
lines. That cost is why the drift test exists. Scope is order-service only. The public
gateway API (bearer auth, Idempotency-Key, 409/422/429/504) is #65. Errors are documented
once as a shared `ProblemDetails` schema under `application/problem+json`, the content
type the filter really sends.

**.NET equivalent.** Swashbuckle or NSwag (or `Microsoft.AspNetCore.OpenApi` in .NET 9+)
reading `[ProducesResponseType]` attributes and data annotations. `[ApiController]` and
`ValidationProblemDetails` match our problem+json. The CLI plugin is like Swashbuckle
inferring schemas from types without attributes.

## Interview questions

1. **How do you keep API docs from drifting from the code?**
   Generate them from the code (code-first) or validate the code against the spec in CI
   (contract-first). Then test the spec: assert the endpoints, error shapes and DTO fields,
   and diff the published spec on every PR (e.g. `oasdiff`) to catch breaking changes.
2. **How would you version a REST API?**
   Avoid breaking changes: only add optional fields, and never remove or rename. When
   breaking is unavoidable, use a new major version in the path (`/v2/orders`) or a media
   type, run both, and deprecate the old one with a `Sunset` header and a date. Events
   work the same way: `order.created.v1` → `.v2`.
3. **Should Swagger UI be public in production?**
   For an internal service behind the gateway, exposing it internally is fine and
   helpful. For a public API, publish the spec on purpose (a developer portal) and don't
   leak internal endpoints or headers. Some teams disable the UI in production and ship
   the JSON as a build artifact instead.
