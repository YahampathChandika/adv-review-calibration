# Security rules

Every change to the service keeps these. A change that needs to break one says so in
its description and changes this file in the same pull request.

- **Credentials.** A bearer token is the only credential. It is never logged, never
  returned by the API, and never written anywhere but the ledger file.
- **Authorisation first.** A request is authorised before its first observable effect:
  before any write, any file, any log line about the resource, and any webhook.
- **Attribution.** Every write is audited under the user who made it. A job the
  service runs on its own records `system`, never a person who did not act.
- **Outbound requests.** The service sends HTTP requests to one place only: the
  webhook endpoint the operator configures. It never requests a URL that a user
  supplied, in whole or in part.
- **Files.** Files are written only under the export directory, with names the service
  chooses.
- **Money.** Amounts are whole cents. Every path that moves money checks the balance it
  moves from at the moment it moves it.
