# Pulumi Digital Ocean

IaC resources for quickly deploying new Digital Ocean droplets.

They are deployed with some base defaults:

- `apt` upgrade/update
- Set timezone
- Create a `sudo` user
- Disable root SSH login
- Enable UFW settings allowing SSH to port 22

Further hardening would be required but, as previously stated, these are quick
dev instances: not intended for long-term usage.

## Running

Set the Digital Ocean token secret value:

```sh
pulumi config set digitalocean:token dop_v1_... --secret
```

Populate some of the additional values in the `Pulumi.X.yaml` file:

```yaml
config:
  pulumi-digitalocean:config:
    # Required:
    image: "ubuntu-22-04-x64" # Valid Digital Ocean image name
    keyName: "id_ed25519"     # Local SSH key base-name (in ~/.ssh/)
    name: "machine_name"      # Name associated with resources here
    # Optional:
    tags: []                  # Default: [] - A list of additional tags for the droplet
    region: ""                # Default: FRA1 - A valid Digital Ocean region
    username: ""              # Default: julian - Ubuntu sudo username
  digitalocean:token:
    secure: XXXXXXXXXXXXXX... # Secret value as previously mentioned
```

## Backend/State

This is really only meant to create temporary instances: we can use local state
like this (to avoid Pulumi cloud or any other thing: I did use Digital Ocean for
this too at one point):

```sh
pulumi logout
pulumi login --local
pulumi stack ls
```

## License

[MIT](/LICENSE).
