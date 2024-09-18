# Pulumi Digital Ocean

IaC resources for quickly deploying new Digital Ocean droplets.

## Running

Set the Digital Ocean token secret value:

```sh
pulumi config set digitalocean:token dop_v1_... --secret
```

Populate some of the additional values in the `Pulumi.X.yaml` file:

```yaml
  pulumi-digitalocean:config:
    image: "ubuntu-22-04-x64" # Valid Digital Ocean image name
    keyName: "id_ed25519"     # Local SSH key base-name (in ~/.ssh/)
    name: "machine_name"      # Name associated with resources here
```

## State

This is really only meant to create temporary instances: we can use local state
like this (to avoid Pulumi cloud or any other thing: I did use DigitalOcean for
this too at one point):

```sh
pulumi logout
pulumi login --local
pulumi stack ls
```

## TODOs

- Consider using my pre-configured Ansible playbooks (probably just cloning a
separate repo) for provisioning.

## License

[MIT](/LICENSE).
