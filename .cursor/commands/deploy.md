Build, push, and deploy the project.

1. Run `./scripts/check.sh` first — if it fails, stop and fix errors
2. Run `./scripts/build.sh` to build and push Docker images
3. Run `./scripts/deploy.sh` to deploy to the target environment
4. The deploy script will automatically:
   - Deploy the stack
   - Wait for stabilization
   - Run health checks
   - Show recent logs
5. Report the result: which services are running, health check status, any errors in logs

If any step fails, read the error output and try to fix it. The scripts provide actionable hints in their error messages.
