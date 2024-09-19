import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";

import * as cloudInit from "@pulumi/cloudinit";
import { Document } from "yaml";

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

interface inputs {
  name: string;
  image: string;
  keyName: string;

  // Optional args:
  region?: digitalocean.Region;
  tags?: string[];
  username?: string;
}

interface key {
  publicKey: string;
  fingerprint: string;
}

/**
 * Get the path of the SSH file (${HOME}/.ssh/ directory).
 *
 * @param {string} target - File to target in this path
 * @returns {string} File contents, UTF-8
 */
function sshFilePath(target: string): string {
  return path.join(os.homedir(), ".ssh", target);
}

/**
 * Get the contents of a file in the ${HOME}/.ssh/ directory.
 *
 * @param {string} target - File to target in this path
 * @returns {string} File contents, UTF-8
 */
function sshFile(target: string): string {
  return fs.readFileSync(sshFilePath(target)).toString("utf8");
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

// @ts-ignore - Error here which seems like a known limitation/common error:
export = async () => {
  const config = new pulumi.Config().requireObject<inputs>("config");

  const publicKey = sshFile(`${config.keyName}.pub`);
  const privateKey = await getKey(config.name, config.keyName);
  const privateKeyPath = sshFilePath(`${config.keyName}`);

  let cloudConfigFile = new Document({
    package_update: true,
    package_upgrade: true,
    timezone: "Europe/London",
    users: [
      {
        name: config.username == undefined ? "julian" : config.username,
        sudo: "ALL=(ALL) NOPASSWD:ALL",
        shell: "/bin/bash",
        lock_passwd: true,
        groups: ["sudo"],
        "ssh-authorized-keys": [publicKey],
      },
    ],
    runcmd: [
      // Disable the root user
      "sed -i '/PermitRootLogin/d' /etc/ssh/sshd_config",
      "echo PermitRootLogin no >> /etc/ssh/sshd_config",
      "systemctl restart sshd",
      // UFW settings
      "ufw allow 22/tcp",
      "ufw enable",
    ],
  });
  // NOTE: Not entirely sure why we can't populate this in the block above...
  //       this is how their documentation does it too, so I assume there's some
  //       weird TypeScript quirk going on here?
  cloudConfigFile.commentBefore = "cloud-config";
  const cloudConfigString = cloudConfigFile.toString();

  const cloudInitConfig = new cloudInit.Config("cloud-init", {
    base64Encode: false,
    gzip: false,
    parts: [
      {
        filename: "cloud-init.yaml",
        content: cloudConfigString,
      },
    ],
  });

  const droplet = new digitalocean.Droplet("droplet", {
    name: config.name,
    size: digitalocean.DropletSlug.DropletC2,
    image: config.image,
    sshKeys: [privateKey],
    region:
      config.region == undefined ? digitalocean.Region.FRA1 : config.region,
    tags: ["pulumi", "automation"].concat(
      config.tags == undefined ? [] : config.tags,
    ),
    userData: cloudInitConfig.rendered,
  });

  return {
    ipv4: droplet.ipv4Address,
    cloudConfig: cloudInitConfig.rendered,
    privateKeyPath: privateKeyPath,
  };
};
