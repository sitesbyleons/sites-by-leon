# OVH production host inventory

Confirmed from the OVH control panel and public DNS on 2026-07-12.

| Item | Value |
| --- | --- |
| Service status | Active |
| Hostname | `vps-aa71e2f6.vps.ovh.us` |
| IPv4 | `15.204.230.82` |
| IPv6 | `2604:2dc0:121::114` |
| Region | Virginia, USA (`US-EAST-VA`, OpenStack zone `os-us-east-va-2`) |
| Plan | VPS-3 2027 |
| Operating system | Ubuntu 26.04 |
| CPU | 6 vCores |
| Memory | 12 GB |
| Local storage | 100 GB |
| Snapshot | Enabled |
| Automated backup | Premium |
| SSH | TCP port 22 reachable over IPv4 |
| SSH host key (ED25519) | `SHA256:+eofg6lnIuf+u+Wvj6ZZOjWEV4THk63fJWSIq1OuYjk` |
| SSH host key (RSA) | `SHA256:yWbzBxfQ9c/USK+jdIcQ2L6qJZ8IOl+QD8TMQ8hi3Qo` |

No password, private key, API credential, or application secret belongs in this file. Cloudflare Tunnel will provide public web ingress; the VPS address will not be placed in public application configuration.

Verify at least the ED25519 fingerprint before accepting the first SSH connection. If the VPS is reinstalled, replace these fingerprints from the OVH console before reconnecting.
