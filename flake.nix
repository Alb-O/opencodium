{
  description = "OpenCode plugins collection";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
    systems.url = "github:nix-systems/default";

    bun2nix.url = "github:baileyluTCD/bun2nix?tag=1.5.2";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
    bun2nix.inputs.systems.follows = "systems";
  };

  nixConfig = {
    extra-substituters = [
      "https://cache.nixos.org"
      "https://cache.garnix.io"
    ];
    extra-trusted-public-keys = [
      "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
      "cache.garnix.io:CTFPyKSLcx5RMJKfLo5EEPUObbA78b0YQ2DTCJXqr9g="
    ];
  };

  outputs =
    {
      nixpkgs,
      systems,
      bun2nix,
      ...
    }:
    let
      eachSystem = nixpkgs.lib.genAttrs (import systems);
      pkgsFor = eachSystem (system: import nixpkgs { inherit system; });
    in
    {
      packages = eachSystem (system: {
        default = pkgsFor.${system}.callPackage ./nix {
          inherit (bun2nix.lib.${system}) mkBunDerivation;
          src = ./.;
          bunNix = ./nix/bun.nix;
        };
      });

      devShells = eachSystem (system: {
        default = pkgsFor.${system}.mkShell {
          packages = with pkgsFor.${system}; [
            bun
            nodejs
            bun2nix.packages.${system}.default
          ];

          shellHook = ''
            if [ -t 0 ]; then
              bun install --frozen-lockfile
              if [ ! -d packages/shared/dist ]; then
                echo "Building shared package..."
                (cd packages/shared && bun run build)
              fi
            fi
          '';
        };
      });

      apps = eachSystem (system: 
        let
          buildBundlesScript = pkgsFor.${system}.writeShellApplication {
            name = "build-bundles";
            runtimeInputs = [ 
              pkgsFor.${system}.bun 
              pkgsFor.${system}.nodejs
              bun2nix.packages.${system}.default
            ];
            text = ''
              set -euo pipefail

              cd "''${1:-.}"

              echo "Building minified plugin bundles for opencodium..."

              echo "Installing dependencies..."
              bun install --frozen-lockfile

              echo "Building shared package..."
              cd packages/shared
              bun run build
              cd ../..

              PLUGINS=(
                "auto-worktree"
                "bash-wrapper"
                "dyn-sym"
                "git-narration"
                "nix-develop"
              )

              for plugin in "''${PLUGINS[@]}"; do
                PLUGIN_DIR="packages/$plugin"
                PLUGIN_SRC="$PLUGIN_DIR/src/index.ts"
                PLUGIN_DIST="$PLUGIN_DIR/dist"
                BUNDLE_OUT="$PLUGIN_DIST/''${plugin}.bundle.js"
                
                if [[ ! -f "$PLUGIN_SRC" ]]; then
                  echo "Warning: $PLUGIN_SRC not found, skipping..."
                  continue
                fi
                
                echo "Building $plugin..."
                mkdir -p "$PLUGIN_DIST"
                
                bun build "$PLUGIN_SRC" \
                  --outfile "$BUNDLE_OUT" \
                  --target node \
                  --minify \
                  --external @opencode-ai/plugin \
                  --external bun
                
                echo "✓ Created $BUNDLE_OUT"
              done

              echo ""
              echo "All plugin bundles created successfully!"
              echo "Bundles are located in packages/*/dist/*.bundle.js"
            '';
          };
        in
        {
          build-bundles = {
            type = "app";
            program = "${buildBundlesScript}/bin/build-bundles";
          };
        }
      );
    };
}
