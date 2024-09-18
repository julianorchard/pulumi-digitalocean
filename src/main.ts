import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";
import * as command from "@pulumi/command";

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

interface inputs {
  name: string;
  image: string;
  keyName: string;
}

interface key {
  publicKey: string;
  fingerprint: string;
}

/**
 * Get the contents of a file in the ${HOME}/.ssh/ directory.
 *
 * @param {string} target - File to target in this path
 * @returns {string} File contents, UTF-8
 */
function sshFile(target: string): string {
  return fs
    .readFileSync(path.join(os.homedir(), ".ssh", target))
    .toString("utf8");
}

/**
 * An async function to check if the input SSH key provided matches one already
 * available to Digital Ocean.
 *
 * @async
 * @param {string} [name] - Name of the key if needed
 * @param {string} [keyName] - Name of the key to get the public key info of
 * @returns {Promise<pulumi.Output<string>>} The SSH fingerprint to use
 */
async function getKey(
  name: string,
  keyName: string,
): Promise<pulumi.Output<string>> {
  const keys = digitalocean.getSshKeys({
    sorts: [
      {
        direction: "asc",
        key: "name",
      },
    ],
  });

  const pub = sshFile(`${keyName}.pub`);

  return keys.then((key) => {
    let k: Array<key> = key.sshKeys.map((i) => {
      return {
        publicKey: i.publicKey,
        fingerprint: i.fingerprint,
      };
    });

    if (k.find((inputKey) => inputKey)) {
      pulumi.log.info(
        "A public key matching the one you provided is already associated with this account.",
      );
      for (let i = 0; i < k.length; i++) {
        // NOTE: Previously used `==` here but have switched to
        //       `.includes()`; pub must include some extra information
        //       in file form (I assume it's a \n) so this fixes it
        // pulumi.log.info("1: " + k[i].publicKey);
        // pulumi.log.info("2: " + pub);
        if (pub.includes(k[i].publicKey)) {
          return pulumi.output(k[i].fingerprint);
        }
      }
      // Should not get here...
      let errorText =
        "A public key matching the one you provided was already associated with the account, but couldn't be found again now.";
      pulumi.log.error(errorText);
      return pulumi.output(`ERROR: ${errorText}`);
    } else {
      return new digitalocean.SshKey("ssh-key", {
        name: name,
        publicKey: pub,
      }).fingerprint;
    }
  });
}

// This is so good. I want to try it with more complicated stuff at some point.
// @ts-ignore - Annoying error here which doesn't make any difference;
export = async () => {
  const config = new pulumi.Config().requireObject<inputs>("config");

  const droplet = new digitalocean.Droplet("droplet", {
    name: config.name,
    size: digitalocean.DropletSlug.DropletC2,
    image: config.image,
    sshKeys: [await getKey(config.name, config.keyName)],
    region: digitalocean.Region.FRA1,
    tags: ["pulumi", "automation"],
  });

  const connection: command.types.input.remote.ConnectionArgs = {
    host: droplet.ipv4Address,
    user: "root",
    privateKey: sshFile(config.keyName),
  };

  // WARN: This isn't good, it won't tell you if the file has changed and try
  //       to replace it...
  const copyFile = new command.remote.CopyFile(
    "copy-script",
    {
      connection,
      localPath: "./bin/provision.sh",
      remotePath: "/root/provision.sh",
    },
    { dependsOn: droplet },
  );

  new command.remote.Command(
    "run-script",
    {
      connection,
      create: "chmod +x /root/provision.sh && /root/provision.sh",
    },
    { dependsOn: copyFile },
  );

  return {
    ipv4: droplet.ipv4Address,
  };
};
