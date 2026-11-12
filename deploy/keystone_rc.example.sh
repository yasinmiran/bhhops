# Copy to ~/keystone_rc.sh, fill in, chmod 0600, then: source ~/keystone_rc.sh
export OS_USERNAME=you@your-institution.no
export OS_PROJECT_NAME=DEMO-you.your-institution.no
# The API password NREC showed once at first login (reset it at https://access.nrec.no).
# On macOS, keep it in the Keychain instead of this file:
#   security add-generic-password -U -a "$USER" -D "environment variable" -s NREC_OPENSTACK_API_KEY -w
export OS_PASSWORD=$(security find-generic-password -w -a "$USER" -D "environment variable" -s NREC_OPENSTACK_API_KEY)
export OS_AUTH_URL=https://api.nrec.no:5000/v3
export OS_IDENTITY_API_VERSION=3
export OS_USER_DOMAIN_NAME=dataporten
export OS_PROJECT_DOMAIN_NAME=dataporten
export OS_REGION_NAME=osl
export OS_INTERFACE=public
export OS_NO_CACHE=1
