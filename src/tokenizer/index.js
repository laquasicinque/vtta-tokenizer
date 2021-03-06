import Utils from "../utils.js";
import View from "./view.js";
import DirectoryPicker from "./../libs/DirectoryPicker.js";

export default class Tokenizer extends FormApplication {
  constructor(options, actor) {
    super(options);
    this.actor = actor;
  }
  /**
   * Define default options for the PartySummary application
   */
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.template = "modules/vtta-tokenizer/src/tokenizer/tokenizer.html";
    options.width = 900;
    options.height = "auto";
    options.classes = ["vtta"];
    return options;
  }

  /* -------------------------------------------- */

  getData() {
    return {
      data: this.actor.data,
      canUpload: game.user && game.user.can("FILES_UPLOAD"), //game.user.isTrusted || game.user.isGM,
      canBrowse: game.user && game.user.can("FILES_BROWSE"),
    };
  }

  async _getFilename(suffix = "Avatar") {
    const isWildCard = () => this.actor.data.token.randomImg;
    const actorName = Utils.makeSlug(this.actor.name);

    if (suffix === "Token" && isWildCard()) {
      const options = DirectoryPicker.parse(game.settings.get("vtta-tokenizer", "image-upload-directory"));

      let tokenWildcard = this.actor.data.token.img;

      if (tokenWildcard.indexOf("*") === -1) {
        // set it to a wildcard we can actually use
        tokenWildcard = `${options.current}/${actorName}.Token-*.png`;
      }
      // get the next free index
      const browser = await FilePicker.browse(options.activeSource, tokenWildcard, {
        wildcard: true,
      });
      let count = 0;
      let targetFilename = "";
      do {
        count++;
        const index = count.toString().padStart(3, "0");
        targetFilename = tokenWildcard.replace(/\*/g, index);
      } while (browser.files.find(filename => filename === targetFilename) !== undefined);

      return targetFilename;
    }
    return `${actorName}.${suffix}.png`;
  }

  _updateObject(event, formData) {
    // Update the object this ApplicationForm is based on
    // e.g. this.object.update(formData)

    // upload token and avatar
    let avatarFilename = formData.targetAvatarFilename;
    let tokenFilename = formData.targetTokenFilename;

    // get the data
    Promise.all([this.Avatar.get("blob"), this.Token.get("blob")]).then(async dataResults => {
      avatarFilename = await Utils.uploadToFoundryV3(dataResults[0], avatarFilename);
      tokenFilename = await Utils.uploadToFoundryV3(dataResults[1], tokenFilename);

      // updating the avatar filename
      const update = {
        img: avatarFilename + "?" + +new Date(),
      };

      // for non-wildcard tokens, we set the token img now
      if (this.actor.data.token.randomImg) {
        const actorName = this.actor.name.replace(/[^\w.]/gi, "_").replace(/__+/g, "");
        const options = DirectoryPicker.parse(game.settings.get("vtta-tokenizer", "image-upload-directory"));

        if (this.actor.data.token.img.indexOf("*") === -1) {
          // set it to a wildcard we can actually use
          ui.notifications.info("Tokenizer: Wildcarding token image to " + this.actor.data.token.img);
          update.token = {
            img: `${options.current}/${actorName}.Token-*.png`,
          };
        }
      } else {
        update.token = {
          img: tokenFilename + "?" + +new Date(),
        };
      }

      await this.actor.update(update);
    });
  }

  /* -------------------------------------------- */

  activateListeners(html) {
    let avatarView = document.querySelector(".avatar > .view");
    this.Avatar = null;

    Utils.download(this.actor.data.img)
      .then(img => {
        const MAX_DIMENSION = Math.max(img.naturalHeight, img.naturalWidth);
        console.log("Setting Avatar dimensions to " + MAX_DIMENSION + "/" + MAX_DIMENSION);
        this.Avatar = new View(MAX_DIMENSION, avatarView);
        this.Avatar.addImageLayer(img);

        // Setting the height of the form to the desired auto height
        $(html).parent().parent().css("height", "auto");
      })
      .catch(error => ui.notifications.error(error));

    let tokenView = document.querySelector(".token > .view");

    // get the target filename for the avatar
    this._getFilename("Avatar").then(targetFilename => {
      $('input[name="targetAvatarFilename"]').val(targetFilename);
    });
    // get the target filename for the token
    this._getFilename("Token").then(targetFilename => {
      $('span[name="targetFilename"]').text(targetFilename);
      $('input[name="targetTokenFilename"]').val(targetFilename);
    });

    if (this.actor.data.token.randomImg) {
      $("#vtta-tokenizer div.token > h1").text("Token (Wildcard)");
      this.Token = new View(game.settings.get("vtta-tokenizer", "token-size"), tokenView);
      // load the default frame, if there is one set
      let type = this.actor.data.type === "character" ? "pc" : "npc";
      let defaultFrame = game.settings.get("vtta-tokenizer", "default-frame-" + type).replace(/^\/|\/$/g, "");

      if (defaultFrame && defaultFrame.trim() !== "") {
        let masked = true;
        let options = DirectoryPicker.parse(defaultFrame);
        // Utils.download(defaultFrame)
        Utils.download(options.current).then(img => this.Token.addImageLayer(img, masked));
      }
    } else {
      this.Token = new View(game.settings.get("vtta-tokenizer", "token-size"), tokenView);

      // Add the actor image to the token view
      Utils.download(this.actor.data.token.img)
        .then(img => {
          this.Token.addImageLayer(img);

          // load the default frame, if there is one set
          let type = this.actor.data.type === "character" ? "pc" : "npc";
          let defaultFrame = game.settings.get("vtta-tokenizer", "default-frame-" + type).replace(/^\/|\/$/g, "");

          if (defaultFrame && defaultFrame.trim() !== "") {
            let masked = true;
            let options = DirectoryPicker.parse(defaultFrame);
            // Utils.download(defaultFrame)
            Utils.download(options.current)
              .then(img => this.Token.addImageLayer(img, masked))
              .catch(error => ui.notifications.error(error));
          }
        })
        .catch(error => ui.notifications.error(error));
    }

    $("#vtta-tokenizer .filePickerTarget").on("change", event => {
      let eventTarget = event.target == event.currentTarget ? event.target : event.currentTarget;
      let view = eventTarget.dataset.target === "avatar" ? this.Avatar : this.Token;
      let type = eventTarget.dataset.type;

      Utils.download(eventTarget.value)
        .then(img => view.addImageLayer(img))
        .catch(error => ui.notifications.error(error));
    });

    $("#vtta-tokenizer button.menu-button").click(async event => {
      event.preventDefault();
      let eventTarget = event.target == event.currentTarget ? event.target : event.currentTarget;

      let view = eventTarget.dataset.target === "avatar" ? this.Avatar : this.Token;
      let type = eventTarget.dataset.type;

      switch (eventTarget.dataset.type) {
        case "upload":
          Utils.upload().then(img => view.addImageLayer(img));
          break;
        case "download":
          // show dialog, then download
          let urlPrompt = new Dialog({
            title: "Download from the internet",
            content: `
                      <p>Please provide the URL of your desired image.</p>
                      <form>
                      <div class="form-group">
                         <label>URL</label>
                         <input id="url" type="text" name="url" placeholder="https://" data-dtype="String">
                      </div>
                      </form>`,
            buttons: {
              cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: "Cancel",
                callback: () => console.log("Cancelled"),
              },
              ok: {
                icon: '<i class="fas fa-check"></i>',
                label: "OK",
                callback: () => {
                  Utils.download($("#url").val())
                    .then(img => view.addImageLayer(img))
                    .catch(error => ui.notification.error(error));
                },
              },
            },
          });

          urlPrompt.render(true);

          break;
        case "avatar":
          this.Avatar.get("img").then(img => view.addImageLayer(img));
          break;
      }
    });

    super.activateListeners(html);
  }
}
