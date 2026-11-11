# Laintas (bundled)

The only model provider in laintas-openclaw. Sign-in is a Laintas
device-code login: the CLI shows a verification link and a code, the
user approves the device on the Laintas accounts page, and the CLI
receives a Laintas session token. Inference goes to the Laintas
OpenAI-compatible endpoint (`https://laintas.com/v1`) with that token;
billing is settled against the user's Laintas account balance by the
Laintas gateway. The token lives only in the auth profile store — it
is never written to config files.
