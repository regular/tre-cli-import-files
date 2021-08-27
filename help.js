module.exports = bin =>
`USAGE

  ${require('./usage')(bin)}

DESCRIPTION

  ${bin} publishes a batch of messages to a network. Messages are defined in JSONFILE. Asset might be published using file-importers.

  TARGET               about target (might be feed id, message id or anything else)
  --publish-prototype MODNAME use given nodejs nodule as file importer. You typically
                       have imprters installed as dev dependencies of your project.
                       Can be specified multiple times.
  --dryRun             do not publish any messages and show diagnostic output
  --config CONFIG      path to JSON file with caps.shs, defaults to .trerc (see FILES)
  --help               show help

${bin} outputs a JSON object containing all message keys to stdout. You might want to put this into .trerc to make it available to tour application. Note: Put this into the "tre" object inside .trerc. Only this object is made available to webapps.

FILES
  
  TRE CONFIG

  If --config CONFIG is not given, ${bin} looks for a file named .trerc in the current directory or above. (and other locations, see rc on npm for details)
  That JSON formatted file must have a property called csps.shs (the network key). The network key is used to discover a ssb server on the local network that shares its manifest with us. This usually only is the case, if it uses the same ssb id (e.g. tre server started from the same directory), or our ssb id is authorized by the server to call manifest() (e.g. bay-of-pleny started with --authorize or ssb-server started with our public key in config.master)

  Auto-discovery ony works if the server uses ssb-lan to broadcasts its address. Bay-of-plenty and tre server do this.

  JSONFILE FORMAT

  The input file has the following format:

  {
    "messages": {
      "root": {
        "type": "folder",
        "name": "root"
      },
      "images": {
        "type": "folder",
        "name": "images",
        "root": "%root",
        "branch": "%root"
      },
      "heart-circle.svg": {
        "type": "svg",
        "name": "heart-circle",
        "svg": "$include assets/heart-circle.svg",
        "branch": "%images",
        "root": "%root"
      }
    }
  }

  You can also put the entire thing into an object called "tre-import". This allows you to put an import configuration into another JSON file, like package.json.

    MESSAGE KEY REFERENCES

  Values starting with a percent sign (%) reference keys of other messages. ${bin} determines the correct order (causal order) to publish messages, so that these references can be resolved to the actial message keys. In the example above, heart-cicrle.svg can only be published after root and images. because it mentions both message keys in its values.

    INCLUDES

  If a value starts with "$include" and is followed by a space and a valid file path, the content of that file is used as the value.

EXAMPLE

  ${bin} imports.json --dryRun
`
