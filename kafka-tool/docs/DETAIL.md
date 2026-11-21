# Kafka

A Kafka Tool-style data query panel in the sidebar's panel list.

## Open it

Click the **Kafka** icon in the left sidebar's panel list; the panel opens in
the main area.

## Connect

Enter one or more broker addresses (`host:9092`, comma separated), optionally
enable **SSL** and **SASL** (PLAIN, SCRAM-SHA-256, SCRAM-SHA-512), then click
**Connect**. The form is saved to `$DSH_HOME/plugins/kafka-tool/config.json` (the password stays in page memory and is never written).
Deployment defaults can be preset through the plugin configuration.

Connecting is always your explicit action. Switching windows or panels keeps
everything alive in the Harness host process (idle objects are swept after 15
minutes); coming back revalidates the connection and reloads fresh data — no
stale caches. Quitting DSH disconnects everything, and after a restart the
panel stays disconnected until you connect again.

## Agent tool

The same read operations are exposed to the agent through the `kafka_query`
tool (connect, list topics and offsets, consumer groups with lag, peek the
latest messages, fetch one message), sharing the panel's Host-side
connections. All tool reads are read-only.

## Features

- **Message stream** — subscribe to multiple topics at once, starting from
  *latest*, *earliest*, a *timestamp*, or a specific *offset* (applied to
  every partition). The virtualized list shows timestamp, topic, partition,
  offset, key, and payload size — no payloads in the list, so tens of
  thousands of buffered messages stay cheap. Click a row and the detail
  dialog fetches that message's payload on demand, with **Hex**, **Text**,
  and **JSON** (auto-pretty) views. Filter by partition, key content, and
  offset range; **Load older** pages backwards through every partition with
  bounded concurrency. If the server buffer overflows between polls, a
  banner tells you exactly how many messages were skipped.
- **Topics** — every topic with its partition count (metadata-only, so
  clusters with thousands of topics open instantly); expand a row to lazily
  load per-partition begin/end offsets and sizes, or send a topic straight
  to the stream view.
- **Consumer groups** — every group with its state and member count; expand a
  row for committed offsets and per-partition lag, kept live across reloads.

## Refresh

The header row offers a manual **Refresh** button and an **Auto refresh**
toggle with a configurable interval in seconds. Auto refresh polls the active
subscription for new messages, or reloads the visible Topics / Consumer
groups view.

## Limits

- Detail payloads are truncated to the first 256 KiB by the host; list keys
  to 8 KiB.
- The page buffer keeps at most 50,000 messages: live appends drop the
  oldest, history paging drops the newest (both are indicated).
- Backfill pages are 100 messages per partition per **Load older** click.
- Authentication supports TLS plus SASL PLAIN/SCRAM; Kerberos, OAuth, and
  client certificates are not configurable yet.
