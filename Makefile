CIRCOM_COMPILER = circom
SNARKJS = npx snarkjs
DEGREE = 17

.PHONY: all generate-keys setup-env install-deps build-all ptau compile-core compile-smt build-contract deploy-contract init-contract dev clean

generate-keys:
	@echo "⏳ Creating and funding the balance for vasp_a..."
	stellar keys generate vasp_a --network testnet --fund
	@echo "⏳ Creating and funding the balance for vasp_b..."
	stellar keys generate vasp_b --network testnet --fund
	@echo "\n=========================================================================="
	@echo "📢 Account successfully created! Copy the data below to your .env file.:"
	@echo "=========================================================================="
	@echo "VITE_VASP_A_ADDRESS =" `stellar keys address vasp_a`
	@echo "VITE_VASP_B_ADDRESS =" `stellar keys address vasp_b`
	@echo "VITE_VASP_A_SECRET  =" `stellar keys secret vasp_a`
	@echo "VITE_VASP_B_SECRET  =" `stellar keys secret vasp_b`
	@echo "=========================================================================="

setup-env:
	@if [ ! -f .env ]; then \
		echo "VITE_CONTRACT_ID=\nVITE_RPC_URL=https://alchemy.com\nVITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015\nVITE_VASP_A_ADDRESS=\nVITE_VASP_B_ADDRESS=\nVITE_VASP_A_SECRET=\nVITE_VASP_B_SECRET=" > .env; \
		echo "✓ File a new .env file has been created in the root directory. Please fill in the required data. 'make generate-keys'."; \
	fi

install-deps: setup-env
	@echo "⏳ Installing Node.js dependencies..."
	npm install
	cd frontend && npm install

build-all: ptau compile-core compile-smt build-contract

ptau:
	mkdir -p circuits/build/core circuits/build/smt
	@if [ ! -f circuits/build/pot17_final.ptau ]; then \
		$(SNARKJS) powersoftau new bn128 $(DEGREE) circuits/build/pot17_0000.ptau -v; \
		$(SNARKJS) powersoftau contribute circuits/build/pot17_0000.ptau circuits/build/pot17_0001.ptau --name="zk-travel-rule" -e="random entropy vasp setup" -v; \
		$(SNARKJS) powersoftau prepare phase2 circuits/build/pot17_0001.ptau circuits/build/pot17_final.ptau -v; \
	fi

compile-core:
	$(CIRCOM_COMPILER) circuits/composed/core.circom --r1cs --wasm --sym --output circuits/build/core
	$(SNARKJS) groth16 setup circuits/build/core/core.r1cs circuits/build/pot17_final.ptau circuits/build/core/core_0000.zkey
	$(SNARKJS) zkey contribute circuits/build/core/core_0000.zkey circuits/build/core/core_final.zkey --name="Core Contributor" -e="zk travel rule core" -v
	$(SNARKJS) zkey export verificationkey circuits/build/core/core_final.zkey circuits/build/core/core_vk.json
	mkdir -p frontend/public/circuits/core_js
	cp circuits/build/core/core_final.zkey frontend/public/circuits/
	cp circuits/build/core/core_vk.json frontend/public/circuits/
	cp circuits/build/core/core_js/core.wasm frontend/public/circuits/core_js/

compile-smt:
	$(CIRCOM_COMPILER) circuits/composed/smt.circom --r1cs --wasm --sym --output circuits/build/smt
	$(SNARKJS) groth16 setup circuits/build/smt/smt.r1cs circuits/build/pot17_final.ptau circuits/build/smt/smt_0000.zkey
	$(SNARKJS) zkey contribute circuits/build/smt/smt_0000.zkey circuits/build/smt/smt_final.zkey --name="SMT Contributor" -e="zk travel rule smt" -v
	$(SNARKJS) zkey export verificationkey circuits/build/smt/smt_final.zkey circuits/build/smt/smt_vk.json
	mkdir -p frontend/public/circuits/smt_js
	cp circuits/build/smt/smt_final.zkey frontend/public/circuits/
	cp circuits/build/smt/smt_vk.json frontend/public/circuits/
	cp circuits/build/smt/smt_js/smt.wasm frontend/public/circuits/smt_js/

build-contract:
	@echo "⏳ Mengompilasi Smart Contract Soroban ke target wasm32v1-none..."
	cargo build --target wasm32v1-none --release

deploy-contract:
	@echo "⏳ Deploying WASM files to the Stellar Testnet via vasp_a..."
	@DEPLOYED_ID=`stellar contract deploy --wasm target/wasm32v1-none/release/travel_rule_verifier.wasm --source-account vasp_a --network testnet --alias travel-rule-verifier`; \
	echo "✓ Contract Successfully Deployed! Your Contract ID: $$DEPLOYED_ID"; \
	echo "⏳ Running 'stellar contract invoke' to initialize the ADMIN account...."; \
	ADMIN_ADDR=`stellar keys address vasp_a`; \
	stellar contract invoke --id $$DEPLOYED_ID --source-account vasp_a --network testnet -- initialize --admin $$ADMIN_ADDR; \
	echo "✓ Admin Initialization Successful!"; \
	echo "\n❗ Please copy the ID. $$DEPLOYED_ID TO VARIABEL 'VITE_CONTRACT_ID' IN YOUR .env FILE BEFORE PROCEEDING❗"

init-contract:
	@echo "⏳ Initiating pre-computation of customer and VASP Merkle Tree data...."
	node --env-file=.env scripts/compute_roots.mjs
	@echo "⏳ Uploading ZK verification keys and Merkle Roots to the Stellar Testnet..."
	node --env-file=.env scripts/setup_contract.mjs

dev:
	@cp .env frontend/.env 2>/dev/null || true
	@echo "🚀 Launching the dApp frontend in a local browser..."
	cd frontend && npm run dev

clean:
	rm -rf circuits/build target/ node_modules/ frontend/node_modules/ frontend/public/circuits/
